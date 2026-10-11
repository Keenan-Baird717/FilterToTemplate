import { fieldDefs } from '../../../agent-core/demo-data'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { EvidencePage } from './EvidencePage'
import { DocBadge, locatorText } from './status'

const parserText = {
  'text-layer': 'PDF text layer',
  ocr: 'OCR (scanned pages)',
  word: 'Word document',
  sheet: 'Spreadsheet',
  email: 'Email message'
} as const

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
                <EvidencePage docId={doc.id} page={page?.n} quote={target?.quote} locator={target?.locator} />
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
