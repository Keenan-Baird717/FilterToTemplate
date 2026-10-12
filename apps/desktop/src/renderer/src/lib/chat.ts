import { Chat } from '@ai-sdk/react'
import type { ChatTransport, UIMessageChunk } from 'ai'
import { initialMessages } from '../../../agent-core/demo-data'
import type { AppChunk, AppUIMessage } from '../../../shared/protocol'
import { getAgent } from './agent-client'
import { useApp } from './store'

/** useChat transport that streams UIMessageChunks over the agent MessagePort. */
class AgentChatTransport implements ChatTransport<AppUIMessage> {
  async sendMessages({ messages, abortSignal }: Parameters<ChatTransport<AppUIMessage>['sendMessages']>[0]) {
    const agent = await getAgent()
    const streamId = crypto.randomUUID()
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        const unsubscribe = agent.subscribe((message) => {
          if (message.type === 'chunk' && message.streamId === streamId) controller.enqueue(message.chunk as AppChunk as UIMessageChunk)
          if (message.type === 'end' && message.streamId === streamId) {
            unsubscribe()
            controller.close()
          }
        })
        abortSignal?.addEventListener('abort', () => agent.send({ type: 'abort', streamId }), { once: true })
        agent.send({ type: 'send', streamId, messages: JSON.parse(JSON.stringify(messages)) })
      }
    })
  }

  async reconnectToStream() {
    return null
  }
}

export const chat = new Chat<AppUIMessage>({
  id: 'engagement-letter',
  transport: new AgentChatTransport(),
  messages: initialMessages,
  onData: (part) => {
    if (part.type === 'data-fill') useApp.getState().apply(part.data)
  },
  onError: (error) => console.error('[chat]', error)
})

export function runFill() {
  void chat.sendMessage({ text: 'Run the fill again from scratch.', metadata: { command: 'run-fill' } })
}
