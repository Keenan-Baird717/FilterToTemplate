import type { FromWorker, ToWorker } from '../../../shared/protocol'

// The renderer talks to the agent over one MessagePort. In Electron the port
// comes from the agent utility process; in a plain browser (the web preview)
// the same engine runs in the page behind an identical interface.

export interface AgentConnection {
  engine: string
  send: (message: ToWorker) => void
  subscribe: (listener: (message: FromWorker) => void) => () => void
}

function fromPort(port: MessagePort): Promise<AgentConnection> {
  const listeners = new Set<(m: FromWorker) => void>()
  return new Promise((resolve) => {
    port.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data
      if (message.type === 'ready') {
        resolve({
          engine: message.engine,
          send: (m) => port.postMessage(m),
          subscribe: (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
          }
        })
        return
      }
      for (const l of listeners) l(message)
    }
    port.start()
  })
}

async function inPage(): Promise<AgentConnection> {
  const { respond, ENGINE_NAME } = await import('../../../agent-core/demo-engine')
  const listeners = new Set<(m: FromWorker) => void>()
  const streams = new Map<string, AbortController>()
  const emit = (m: FromWorker) => queueMicrotask(() => listeners.forEach((l) => l(m)))
  return {
    engine: `${ENGINE_NAME} · in page`,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    send: (message) => {
      if (message.type === 'abort') {
        streams.get(message.streamId)?.abort()
        return
      }
      const { streamId } = message
      const controller = new AbortController()
      streams.set(streamId, controller)
      respond(structuredClone(message.messages), {
        emit: (chunk) => emit({ type: 'chunk', streamId, chunk }),
        signal: controller.signal
      })
        .catch((error) => {
          if (!controller.signal.aborted) emit({ type: 'chunk', streamId, chunk: { type: 'error', errorText: String(error) } })
        })
        .finally(() => {
          streams.delete(streamId)
          emit({ type: 'end', streamId })
        })
    }
  }
}

let connection: Promise<AgentConnection> | null = null
let portWaiter: ((port: MessagePort) => void) | null = null
let earlyPort: MessagePort | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data !== 'ftt:agent-port' || !event.ports[0]) return
    if (portWaiter) portWaiter(event.ports[0])
    else earlyPort = event.ports[0]
  })
}

export function getAgent(): Promise<AgentConnection> {
  if (connection) return connection
  if (!window.ftt?.isElectron) return (connection = inPage())
  connection = new Promise<MessagePort>((resolve, reject) => {
    if (earlyPort) return resolve(earlyPort)
    portWaiter = resolve
    setTimeout(() => reject(new Error('Agent worker did not connect')), 5000)
  })
    .then(fromPort)
    .catch((error) => {
      console.warn(`${String(error)}; running the agent in the page instead`)
      return inPage()
    })
  return connection
}
