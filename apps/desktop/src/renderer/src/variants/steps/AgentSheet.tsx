import { ArrowUp, Square } from 'lucide-react'
import { useState } from 'react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { ChatMessage } from '@/components/ChatPane'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { sendPrompt, useAgent, useEngineName } from '@/lib/agent'

const suggestions = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']

/** The conversation, tucked into a side sheet so the flow stays calm. */
export function AgentSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { messages, busy, status, stop } = useAgent()
  const engine = useEngineName()
  const [input, setInput] = useState('')

  const submit = (text: string) => {
    if (!text.trim() || busy) return
    sendPrompt(text)
    setInput('')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 border-rule bg-panel p-0 sm:max-w-[480px]">
        <SheetHeader className="gap-1 border-b border-rule px-5 pt-5 pb-4">
          <SheetTitle className="steps-display pr-8 text-[22px] font-normal">Ask the agent</SheetTitle>
          <SheetDescription className="text-[13.5px] text-ink-3">{engine} · ask where a value came from, or what to change</SheetDescription>
        </SheetHeader>

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="gap-5 px-5 py-5">
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} busy={busy} />
            ))}
            {status === 'submitted' && <Shimmer className="text-[13px]">Thinking…</Shimmer>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="flex flex-col gap-3 border-t border-rule p-4">
          {!busy && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-rule px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-ink-3/50 hover:bg-panel-2 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2 rounded-2xl border border-rule bg-panel p-2 focus-within:border-[var(--steps-focus)]"
            onSubmit={(e) => {
              e.preventDefault()
              submit(input)
            }}
          >
            <label htmlFor="steps-chat-input" className="sr-only">
              Message the agent
            </label>
            <Textarea
              id="steps-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit(input)
                }
              }}
              placeholder="Ask about a value, or say what to change"
              className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-2 py-2 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {busy ? (
              <Button type="button" size="icon" variant="secondary" className="size-10 shrink-0 rounded-full" onClick={() => void stop()} aria-label="Stop the agent">
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={!input.trim()} aria-label="Send message">
                <ArrowUp className="size-4.5" />
              </Button>
            )}
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
