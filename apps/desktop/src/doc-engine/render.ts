// Fills a Word layout from the fill state with docxtemplater. The same code
// produces the exported .docx and the in-app preview; the preview variant wraps
// each value in invisible markers so the renderer can highlight and link it.

import Docxtemplater from 'docxtemplater'
import expressionParser from 'docxtemplater/expressions.js'
import PizZip from 'pizzip'
import { fieldDefs } from '../agent-core/demo-data.ts'
import type { FieldState, RatesState } from '../shared/protocol'

export const MARK = {
  start: '',
  missing: '',
  sep: '',
  end: ''
} as const

/** Field ids in a fixed order so a marker can carry a short numeric reference. */
export const markerFields = [...Object.keys(fieldDefs), 'hourlyRates']

export interface RenderOptions {
  /** Wrap values in preview markers. Never set for exported files. */
  preview?: boolean
  letterDate?: string
}

function display(f: FieldState | undefined): string | null {
  if (!f || f.value === null || f.value === '') return null
  if (f.display) return f.display
  if (typeof f.value === 'boolean') return f.value ? 'Yes' : 'No'
  return String(f.value)
}

export function toRenderData(fields: Record<string, FieldState>, rates: RatesState, opts: RenderOptions = {}) {
  const wrap = (fieldId: string, text: string | null) => {
    const label = `[${fieldDefs[fieldId]?.label ?? (fieldId === 'hourlyRates' ? 'Hourly rates' : fieldId)}]`
    if (!opts.preview) return text ?? label
    const ref = markerFields.indexOf(fieldId)
    return text === null ? `${MARK.missing}${ref}${MARK.sep}${label}${MARK.end}` : `${MARK.start}${ref}${MARK.sep}${text}${MARK.end}`
  }
  const v = (fieldId: string) => wrap(fieldId, display(fields[fieldId]))

  const signatory = display(fields['client.signatory'])
  const scope = display(fields['scopeSummary'])
  const basis = fields['fee.basis']?.value

  return {
    letterDate: opts.letterDate ?? '11 October 2026',
    client: { name: v('client.name'), address: v('client.address'), signatory: v('client.signatory') },
    salutation: wrap('client.signatory', signatory ? signatory.split(',')[0] : null),
    billing: { email: v('billing.email') },
    matter: { description: v('matter.description') },
    effectiveDate: v('effectiveDate'),
    governingLaw: v('governingLaw'),
    isHourly: basis === 'hourly' || basis === null || basis === undefined,
    fee: { cap: v('fee.cap') },
    retainer: v('retainer'),
    paymentTerms: v('paymentTerms'),
    includesLitigation: fields['includesLitigation']?.value === true,
    scopeParagraphs: (scope ? scope.split(/\n{2,}/) : [null]).map((text) => ({ text: wrap('scopeSummary', text) })),
    hourlyRates: rates.rows.length
      ? rates.rows.map((r) => ({ role: r.role, rate: wrap('hourlyRates', `$${r.rate.toLocaleString('en-US')}`) }))
      : [{ role: wrap('hourlyRates', null), rate: '' }],
    firm: { signatory: v('firm.signatory') }
  }
}

export function renderDocx(layout: Uint8Array, data: object): Uint8Array {
  const doc = new Docxtemplater(new PizZip(layout), {
    paragraphLoop: true,
    linebreaks: true,
    parser: expressionParser,
    nullGetter: () => ''
  })
  doc.render(data)
  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' })
}
