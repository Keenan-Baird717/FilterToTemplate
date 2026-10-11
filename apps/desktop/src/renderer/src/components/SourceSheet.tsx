import { FileSearch } from 'lucide-react'
import type { ReactNode } from 'react'
import { fieldDefs } from '../../../agent-core/demo-data'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { DocBadge, locatorText } from './status'

const parserText = {
  'text-layer': 'PDF text layer',
  ocr: 'OCR (scanned pages)',
  word: 'Word document',
  sheet: 'Spreadsheet',
  email: 'Email message'
} as const

/** Highlight the cited quote inside a block, tolerant of curly quotes and spacing. */
function mark(text: string, quote: string | undefined): ReactNode {
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

export function SourceSheet() {
  const target = useApp((s) => s.source)
  const close = useApp((s) => s.closeSource)
  const openSource = useApp((s) => s.openSource)
  const doc = useApp((s) => s.docs.find((d) => d.id === target?.docId))
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const cites = doc ? (citationsByDoc(fields, rates)[doc.id] ?? []) : []
  const page = doc?.content.find((p) => p.n === target?.page) ?? doc?.content[0]
  const citedFields = [...new Set(cites.map((c) => c.fieldId))]

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full gap-0 border-rule bg-panel p-0 sm:max-w-[560px]">
        {doc && (
          <>
            <SheetHeader className="gap-1.5 border-b border-rule px-5 pt-5 pb-4">
              <div className="flex items-center gap-2 pr-8">
                <DocBadge kind={doc.kind} />
                <SheetTitle className="truncate text-[15px]">{doc.name}</SheetTitle>
              </div>
              <SheetDescription className="num text-[12px]">
                {doc.id} · {doc.kind === 'xlsx' ? '1 sheet' : doc.kind === 'eml' ? '1 message' : `${doc.pages} pages`} · {parserText[doc.parser]} · added {doc.added}
              </SheetDescription>
              {doc.content.length > 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1" role="tablist" aria-label="Cited pages">
                  {doc.content.map((p) => (
                    <button
                      key={p.n}
                      type="button"
                      role="tab"
                      aria-selected={page?.n === p.n}
                      onClick={() => openSource({ docId: doc.id, page: p.n, quote: cites.find((c) => c.source.page === p.n)?.source.quote })}
                      className={cn(
                        'rounded-md border px-2 py-0.5 font-mono text-[11px]',
                        page?.n === p.n ? 'border-cobalt/50 bg-cobalt-soft text-cobalt' : 'border-rule text-ink-2 hover:text-ink'
                      )}
                    >
                      p.{p.n}
                    </button>
                  ))}
                </div>
              )}
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1 bg-ground">
              <div className="p-5">
                {doc.sheet ? (
                  <div className="overflow-x-auto rounded-md border border-rule bg-panel">
                    <table className="w-full font-mono text-[12px]">
                      <thead>
                        <tr className="bg-panel-2 text-ink-3">
                          <th className="w-10 border-r border-b border-rule py-1 font-normal" />
                          {['A', 'B', 'C'].map((c) => (
                            <th key={c} className="border-r border-b border-rule py-1 font-normal">
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
                          const hit = target?.locator?.includes(`B${row}`)
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
                    <p className="border-t border-rule px-3 py-2 font-sans text-[11px] text-ink-3">Sheet “{doc.sheet.name}” · range {doc.sheet.range}</p>
                  </div>
                ) : page ? (
                  <div className="mx-auto max-w-[480px] bg-paper px-8 py-9 font-serif text-[14px] leading-[1.65] text-paper-ink" style={{ boxShadow: 'var(--shadow-page)' }}>
                    <div className="mb-4 flex justify-between font-sans text-[10px] tracking-wide text-paper-ink/50 uppercase">
                      <span>{doc.name}</span>
                      <span>{doc.kind === 'eml' ? 'Message' : `Page ${page.n} of ${doc.pages}`}</span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {page.blocks.map((b, i) => (
                        <p key={i} className={cn(i === 0 && 'font-semibold')}>
                          {mark(b, target?.quote)}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-16 text-center text-[13px] text-ink-3">
                    <FileSearch className="size-6" />
                    {doc.status === 'parsing' ? 'Still parsing this file.' : 'Page images for files added in this preview aren’t rendered.'}
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-rule px-5 py-3.5">
              <div className="eyebrow mb-2">Cited by</div>
              {citedFields.length ? (
                <ul className="flex flex-col gap-1">
                  {citedFields.map((fid) => {
                    const c = cites.find((x) => x.fieldId === fid)!
                    return (
                      <li key={fid} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-ink">{fid === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[fid]?.label ?? fid)}</span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-3">{locatorText(c.source)}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">No field cites this document yet.</p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
