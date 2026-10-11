import { FileSearch } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

// One source page (or sheet range, or email) with the cited quote marked.
// Used by the source drawer and by any prototype that shows evidence inline.

/** Highlight the cited quote inside a block, tolerant of curly quotes and case. */
export function markQuote(text: string, quote: string | undefined): ReactNode {
  if (!quote) return text
  const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase()
  const idx = norm(text).indexOf(norm(quote))
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[2px] bg-marker px-0.5 text-marker-ink">{text.slice(idx, idx + quote.length)}</mark>
      {text.slice(idx + quote.length)}
    </>
  )
}

export interface EvidencePageProps {
  docId: string
  page?: number
  quote?: string
  locator?: string
  /** Tighter type and padding for inline use. */
  compact?: boolean
  className?: string
}

export function EvidencePage({ docId, page, quote, locator, compact, className }: EvidencePageProps) {
  const doc = useApp((s) => s.docs.find((d) => d.id === docId))
  if (!doc) return null
  const content = doc.content.find((p) => p.n === page) ?? doc.content[0]

  if (doc.sheet) {
    return (
      <div className={cn('overflow-x-auto rounded-md border border-rule bg-panel', className)}>
        <table className={cn('w-full font-mono', compact ? 'text-[11px]' : 'text-[12px]')}>
          <thead>
            <tr className="bg-panel-2 text-ink-3">
              <th className="w-9 border-r border-b border-rule py-1 font-normal" />
              {['A', 'B', 'C'].map((c) => (
                <th key={c} className="border-r border-b border-rule py-1 font-normal last:border-r-0">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-r border-b border-rule bg-panel-2 text-center text-ink-3">1</td>
              <td className="border-r border-b border-rule px-2 py-1 text-ink-3">FY27</td>
              <td className="border-r border-b border-rule px-2 py-1 font-semibold">Role</td>
              <td className="border-b border-rule px-2 py-1 font-semibold">USD / hr</td>
            </tr>
            {doc.sheet.rows.map(([role, rate], i) => {
              const row = i + 2
              const hit = locator?.includes(`B${row}`) || (!locator && quote?.startsWith(role))
              return (
                <tr key={role} className={cn(hit && 'bg-marker text-marker-ink')}>
                  <td className="border-r border-b border-rule bg-panel-2 text-center text-ink-3">{row}</td>
                  <td className="border-r border-b border-rule px-2 py-1" />
                  <td className="border-r border-b border-rule px-2 py-1">{role}</td>
                  <td className="num border-b border-rule px-2 py-1 text-right">{rate}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="border-t border-rule px-3 py-2 font-sans text-[11px] text-ink-3">
          {doc.name} · sheet “{doc.sheet.name}” · {locator ?? doc.sheet.range}
        </p>
      </div>
    )
  }

  if (!content) {
    return (
      <div className={cn('flex flex-col items-center gap-2 py-12 text-center text-[13px] text-ink-3', className)}>
        <FileSearch className="size-6" />
        {doc.status === 'parsing' ? 'Still parsing this file.' : 'Page images for files added in this preview aren’t rendered.'}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-paper font-serif text-paper-ink',
        compact ? 'px-5 py-5 text-[13px] leading-[1.6]' : 'mx-auto max-w-[480px] px-8 py-9 text-[14px] leading-[1.65]',
        className
      )}
      style={{ boxShadow: 'var(--shadow-page)' }}
    >
      <div className="mb-3 flex justify-between gap-3 font-sans text-[10px] tracking-wide text-paper-ink/50 uppercase">
        <span className="truncate">{doc.name}</span>
        <span className="shrink-0">{doc.kind === 'eml' ? 'Message' : `Page ${content.n} of ${doc.pages}`}</span>
      </div>
      <div className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
        {content.blocks.map((b, i) => (
          <p key={i} className={cn(i === 0 && 'font-semibold')}>
            {markQuote(b, quote)}
          </p>
        ))}
      </div>
    </div>
  )
}
