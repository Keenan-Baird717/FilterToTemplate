import { Highlighter } from 'lucide-react'
import type { ReactNode } from 'react'
import { fieldDefs, project } from '../../../agent-core/demo-data'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

// Stand-in for the docx-preview render of the filled layout.docx. Values come
// straight from the fill state, so edits and answers show up immediately.

function V({ id, children }: { id: string; children?: ReactNode }) {
  const field = useApp((s) => s.fields[id])
  const highlight = useApp((s) => s.highlight)
  const text = children ?? displayValue(field)
  if (!text) {
    return (
      <span className="rounded-[3px] bg-warn-soft px-1 font-sans text-[0.8em] font-medium text-warn not-italic">
        {fieldDefs[id]?.label ?? id}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'transition-colors',
        highlight && 'rounded-[2px] bg-cobalt/[0.07] underline decoration-cobalt/45 decoration-1 underline-offset-[3px]'
      )}
    >
      {text}
    </span>
  )
}

export function PreviewPane() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const highlight = useApp((s) => s.highlight)
  const setHighlight = useApp((s) => s.setHighlight)
  const signatory = displayValue(fields['client.signatory'])
  const salutation = signatory ? signatory.split(',')[0] : null
  const scope = displayValue(fields['scopeSummary'])

  return (
    <div className="flex h-full min-h-0 flex-col bg-ground">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-panel px-5 py-2 text-[12px] text-ink-3 sm:px-6">
        <span>Fast preview of layout.docx. Page breaks are approximate.</span>
        <label className="flex cursor-pointer items-center gap-2 text-ink-2" htmlFor="highlight-fields">
          <Highlighter className="size-3.5" /> Highlight filled values
          <Switch id="highlight-fields" checked={highlight} onCheckedChange={setHighlight} />
        </label>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-6 sm:px-8 sm:py-10">
          <article
            className="mx-auto w-full max-w-[720px] bg-paper px-6 py-10 font-serif text-[15px] leading-[1.6] text-paper-ink sm:px-[72px] sm:py-[64px]"
            style={{ boxShadow: 'var(--shadow-page)' }}
            aria-label="Letter preview"
          >
            <header className="mb-10 flex flex-col gap-1 border-b border-paper-rule pb-5">
              <div className="text-[13px] font-semibold tracking-[0.22em]">CALDER &amp; REYES LLP</div>
              <div className="font-sans text-[11px] tracking-wide text-paper-ink/60">
                1 Embarcadero Center, Suite 2400 · San Francisco, CA 94111
              </div>
            </header>

            <p className="mb-6">11 October 2026</p>

            <p className="mb-6">
              <V id="client.signatory" />
              <br />
              <V id="client.name" />
              <br />
              <V id="client.address" />
            </p>

            <p className="mb-6 font-semibold">
              Re: Engagement letter · <V id="matter.description" />
            </p>

            <p className="mb-4">Dear {salutation ? <V id="client.signatory">{salutation}</V> : <V id="client.signatory" />},</p>

            <p className="mb-4">
              Thank you for selecting {project.firm}. This letter confirms the terms on which we will represent <V id="client.name" /> in connection with
              the matter above, effective <V id="effectiveDate" />.
            </p>

            <h3 className="mt-7 mb-2 text-[15px] font-semibold">1. Scope of engagement</h3>
            {scope ? (
              scope.split('\n\n').map((p, i) => (
                <p key={i} className="mb-3">
                  <V id="scopeSummary">{p}</V>
                </p>
              ))
            ) : (
              <p className="mb-3">
                <V id="scopeSummary" />
              </p>
            )}
            <p className="mb-3">
              <span className="mr-2 text-[17px] leading-none" aria-hidden>
                {fields['includesLitigation']?.value ? '☒' : '☐'}
              </span>
              Litigation support included
            </p>

            <h3 className="mt-7 mb-2 text-[15px] font-semibold">2. Fees and billing</h3>
            <p className="mb-3">
              We will bill on an <V id="fee.basis">{String(displayValue(fields['fee.basis']) ?? '').toLowerCase() || undefined}</V> basis at the rates
              below. Total fees will not exceed <V id="fee.cap" /> without your written approval.
            </p>
            <table className="mb-4 w-full max-w-[380px] border-collapse font-sans text-[13px]">
              <thead>
                <tr className="border-b border-paper-rule text-left">
                  <th className="py-1.5 font-semibold">Role</th>
                  <th className="py-1.5 text-right font-semibold">Hourly rate</th>
                </tr>
              </thead>
              <tbody>
                {rates.rows.length ? (
                  rates.rows.map((r) => (
                    <tr key={r.key} className="border-b border-paper-rule/70">
                      <td className="py-1.5">{r.role}</td>
                      <td className="num py-1.5 text-right">
                        <span className={cn(highlight && 'underline decoration-cobalt/45 underline-offset-[3px]')}>${r.rate}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="py-1.5">
                      <span className="rounded-[3px] bg-warn-soft px-1 text-[0.85em] font-medium text-warn">Hourly rates</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mb-3">
              You agree to pay a retainer of <V id="retainer" />, applied to our final invoice. Invoices are payable <V id="paymentTerms" /> and will be sent
              to <V id="billing.email" />.
            </p>

            <h3 className="mt-7 mb-2 text-[15px] font-semibold">3. Governing law</h3>
            <p className="mb-10">
              This letter is governed by the laws of the State of <V id="governingLaw" />.
            </p>

            <div className="grid grid-cols-1 gap-8 font-sans text-[13px] sm:grid-cols-2">
              <div>
                <div className="mb-8 font-semibold tracking-wide">CALDER &amp; REYES LLP</div>
                <div className="border-t border-paper-ink/40 pt-1.5">
                  <V id="firm.signatory" />
                </div>
              </div>
              <div>
                <div className="mb-8 font-semibold tracking-wide">
                  ACKNOWLEDGED: <V id="client.name" />
                </div>
                <div className="border-t border-paper-ink/40 pt-1.5">
                  <V id="client.signatory" />
                </div>
              </div>
            </div>
          </article>
        </div>
      </ScrollArea>
    </div>
  )
}
