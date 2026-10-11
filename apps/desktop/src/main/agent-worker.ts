// Agent utility process. In the full build this hosts CopilotClient and the
// app's custom tools; here it hosts the scripted engine behind the same
// MessagePort contract.

import type { MessagePortMain } from 'electron'
import { ENGINE_NAME, respond } from '../agent-core/demo-engine'
import { toWorkerSchema, type FromWorker } from '../shared/protocol'

function serve(port: MessagePortMain) {
  const streams = new Map<string, AbortController>()
  const send = (message: FromWorker) => port.postMessage(message)

  port.on('message', async (event) => {
    const parsed = toWorkerSchema.safeParse(event.data)
    if (!parsed.success) {
      console.error('[agent] rejected message', parsed.error.issues)
      return
    }
    const message = parsed.data
    if (message.type === 'abort') {
      streams.get(message.streamId)?.abort()
      return
    }

    const { streamId } = message
    const controller = new AbortController()
    streams.set(streamId, controller)
    try {
      await respond(message.messages, {
        emit: (chunk) => send({ type: 'chunk', streamId, chunk }),
        signal: controller.signal
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        send({ type: 'chunk', streamId, chunk: { type: 'error', errorText: String(error) } })
      }
    } finally {
      streams.delete(streamId)
      send({ type: 'end', streamId })
    }
  })

  port.start()
  send({ type: 'ready', engine: `${ENGINE_NAME} · utility process` })
}

process.parentPort.on('message', (event) => {
  const [port] = event.ports
  if (port) serve(port)
})
