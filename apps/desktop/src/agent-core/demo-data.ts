// Example project used by the prototype: an engagement letter for a fictional
// client, filled from eight uploaded documents. Every value is invented.

import type { AppUIMessage, FieldState, QuestionSet, RatesState, SourceRef } from '../shared/protocol'

export type DocKind = 'pdf' | 'docx' | 'xlsx' | 'eml'
export type DocParser = 'text-layer' | 'ocr' | 'word' | 'sheet' | 'email'

export interface DemoPage {
  n: number
  blocks: string[]
}

export interface DemoDocument {
  id: string
  name: string
  kind: DocKind
  pages: number
  parser: DocParser
  status: 'indexed' | 'parsing'
  progress?: number
  added: string
  content: DemoPage[]
  /** For spreadsheets: rows shown in the source viewer. */
  sheet?: { name: string; range: string; rows: [string, string][] }
}

export const project = {
  client: 'Acme Holdings',
  title: 'Engagement letter',
  firm: 'Calder & Reyes LLP'
}

export const documents: DemoDocument[] = [
  {
    id: 'D1',
    name: 'Acme_MSA_signed_2026-03.pdf',
    kind: 'pdf',
    pages: 14,
    parser: 'text-layer',
    status: 'indexed',
    added: 'Oct 9',
    content: [
      {
        n: 1,
        blocks: [
          'MASTER SERVICES AGREEMENT',
          'This Master Services Agreement (the “Agreement”) is entered into as of March 3, 2026 by and between ACME HOLDINGS, L.L.C., a Delaware limited liability company with its principal office at 500 Market Street, Suite 1200, San Francisco, CA 94105 (“Client”), and Calder & Reyes LLP (“Firm”).',
          '1. Services. Firm will provide the legal services described in each Statement of Work executed under this Agreement.'
        ]
      },
      {
        n: 9,
        blocks: [
          '7. Fees and Payment.',
          '7.1 Fees are set out in the applicable Statement of Work.',
          '7.2 Client shall pay each undisputed invoice within thirty (30) days of the invoice date.',
          '7.3 Late amounts accrue interest at 1% per month or the maximum rate permitted by law, whichever is less.'
        ]
      },
      {
        n: 12,
        blocks: [
          '12. Governing Law.',
          'This Agreement is governed by the laws of the State of California, without regard to its conflict-of-laws rules.',
          '13. Notices. Notices must be in writing and delivered to the addresses on page 1.'
        ]
      }
    ]
  },
  {
    id: 'D2',
    name: 'Acme_SOW_03_v3.docx',
    kind: 'docx',
    pages: 6,
    parser: 'word',
    status: 'indexed',
    added: 'Oct 9',
    content: [
      {
        n: 2,
        blocks: [
          '2. Term.',
          'Services under this Statement of Work commence November 1, 2026 and continue until the Financing closes or is abandoned.'
        ]
      },
      {
        n: 3,
        blocks: [
          '3. Fees.',
          'Matter: Series C financing and vendor contract review.',
          'Services are billed hourly at the rates in Schedule A. Total fees under this SOW are not to exceed $180,000 without Client’s written approval.'
        ]
      }
    ]
  },
  {
    id: 'D3',
    name: 'Kickoff_call_notes_2026-09-18.docx',
    kind: 'docx',
    pages: 2,
    parser: 'word',
    status: 'indexed',
    added: 'Oct 9',
    content: [
      {
        n: 1,
        blocks: [
          'Kickoff call: Acme / C&R, September 18, 2026',
          'Attendees: Dana Whitfield (GC, Acme), Morgan Reyes, Priya Natarajan.',
          'Scope: lead counsel on the Series C financing; review of the top 20 vendor contracts before closing.',
          'Litigation is out of scope for now; Dana will raise separately if the Halvorsen dispute escalates.',
          'Action: Dana to send billing contact for invoices.'
        ]
      }
    ]
  },
  {
    id: 'D4',
    name: 'Rate_card_FY27.xlsx',
    kind: 'xlsx',
    pages: 1,
    parser: 'sheet',
    status: 'indexed',
    added: 'Oct 10',
    content: [],
    sheet: {
      name: 'Rates',
      range: 'B2:C5',
      rows: [
        ['Partner', '650'],
        ['Senior Associate', '425'],
        ['Associate', '310'],
        ['Paralegal', '180']
      ]
    }
  },
  {
    id: 'D5',
    name: 'RE_ engagement terms.eml',
    kind: 'eml',
    pages: 1,
    parser: 'email',
    status: 'indexed',
    added: 'Oct 10',
    content: [
      {
        n: 1,
        blocks: [
          'From: Dana Whitfield · To: Morgan Reyes · Sep 22, 2026',
          'Morgan, confirming we’re fine with a retainer of $25,000, applied to the final invoice.',
          'I’ll sign the engagement letter on Acme’s behalf.',
          'Dana Whitfield, General Counsel, Acme Holdings LLC'
        ]
      }
    ]
  },
  {
    id: 'D6',
    name: 'Acme_certificate_of_formation.pdf',
    kind: 'pdf',
    pages: 3,
    parser: 'ocr',
    status: 'indexed',
    added: 'Oct 10',
    content: [
      {
        n: 1,
        blocks: [
          'STATE OF DELAWARE · CERTIFICATE OF FORMATION OF LIMITED LIABILITY COMPANY',
          'First: The name of the limited liability company is ACME HOLDINGS, L.L.C.',
          'Second: The address of its registered office in the State of Delaware is 1209 Orange Street, Wilmington, DE 19801.'
        ]
      }
    ]
  },
  {
    id: 'D7',
    name: 'SOW_03_Amendment_1.pdf',
    kind: 'pdf',
    pages: 2,
    parser: 'text-layer',
    status: 'indexed',
    added: 'Oct 11',
    content: [
      {
        n: 1,
        blocks: [
          'Amendment No. 1 to Statement of Work No. 3',
          'Section 2 of the SOW is amended so that Services are effective 1 December 2026, following the board’s approval of the term sheet.',
          'All other terms of the SOW remain in effect.'
        ]
      }
    ]
  },
  {
    id: 'D8',
    name: 'Conflicts_check_Halvorsen.pdf',
    kind: 'pdf',
    pages: 5,
    parser: 'ocr',
    status: 'parsing',
    progress: 64,
    added: 'Oct 11',
    content: []
  }
]

// ---------------------------------------------------------------------------
// Template definition (what template.json / schema.json would generate).
// ---------------------------------------------------------------------------

export type FieldKind = 'text' | 'date' | 'money' | 'enum' | 'boolean' | 'narrative' | 'email'

export interface FieldDef {
  id: string
  label: string
  kind: FieldKind
  tag: string
  required?: boolean
  help?: string
}

export interface SectionDef {
  id: string
  title: string
  fields: string[]
  /** The repeating hourly-rate group renders inside this section. */
  hasRates?: boolean
}

export const template = {
  id: 'engagement-letter',
  name: 'Engagement Letter',
  version: '2.1.0',
  engine: 'docxtemplater 3.71'
}

export const fieldDefs: Record<string, FieldDef> = {
  'client.name': { id: 'client.name', label: 'Client legal name', kind: 'text', tag: '{client.name}', required: true },
  'client.address': { id: 'client.address', label: 'Client address', kind: 'text', tag: '{client.address}', required: true },
  'client.signatory': { id: 'client.signatory', label: 'Client signatory', kind: 'text', tag: '{client.signatory}', required: true },
  'billing.email': { id: 'billing.email', label: 'Billing contact email', kind: 'email', tag: '{billing.email}', required: true },
  'matter.description': { id: 'matter.description', label: 'Matter', kind: 'text', tag: '{matter.description}', required: true },
  effectiveDate: { id: 'effectiveDate', label: 'Effective date', kind: 'date', tag: '{effectiveDate}', required: true },
  governingLaw: { id: 'governingLaw', label: 'Governing law', kind: 'text', tag: '{governingLaw}', required: true },
  'fee.basis': { id: 'fee.basis', label: 'Fee basis', kind: 'enum', tag: '{#isHourly}…{/isHourly}', required: true },
  'fee.cap': { id: 'fee.cap', label: 'Fee cap', kind: 'money', tag: '{fee.cap}' },
  retainer: { id: 'retainer', label: 'Retainer', kind: 'money', tag: '{retainer}' },
  paymentTerms: { id: 'paymentTerms', label: 'Payment terms', kind: 'text', tag: '{paymentTerms}', required: true },
  includesLitigation: { id: 'includesLitigation', label: 'Litigation included', kind: 'boolean', tag: "{includesLitigation ? '☒' : '☐'}" },
  scopeSummary: {
    id: 'scopeSummary',
    label: 'Scope of engagement',
    kind: 'narrative',
    tag: '{#scopeParagraphs}{text}{/}',
    required: true,
    help: 'Two to four short paragraphs, formal third person. Every fact cites a source.'
  },
  'firm.signatory': { id: 'firm.signatory', label: 'Firm signatory', kind: 'text', tag: '{firm.signatory}', required: true }
}

export const sections: SectionDef[] = [
  { id: 'parties', title: 'Parties', fields: ['client.name', 'client.address', 'client.signatory', 'billing.email'] },
  { id: 'engagement', title: 'Engagement', fields: ['matter.description', 'effectiveDate', 'governingLaw'] },
  { id: 'fees', title: 'Fees', fields: ['fee.basis', 'fee.cap', 'retainer', 'paymentTerms'], hasRates: true },
  { id: 'scope', title: 'Scope', fields: ['includesLitigation', 'scopeSummary'] },
  { id: 'signatures', title: 'Signatures', fields: ['firm.signatory'] }
]

/** Fields plus the rate table: what the progress bar counts. */
export const trackedCount = Object.keys(fieldDefs).length + 1

// ---------------------------------------------------------------------------
// Values the agent finds, with the exact quotes it cites.
// ---------------------------------------------------------------------------

const src = (docId: string, page: number | undefined, quote: string, locator?: string): SourceRef => ({
  docId,
  page,
  quote,
  locator
})

export const scopeSummaryText =
  'Calder & Reyes LLP will act as lead counsel to Acme Holdings LLC on its Series C financing, including the term sheet, definitive agreements and closing deliverables.\n\n' +
  'Before closing, the Firm will also review Acme’s top 20 vendor contracts for change-of-control, assignment and termination provisions that could affect the financing.\n\n' +
  'Litigation, including any matter arising from the Halvorsen dispute, is outside the scope of this engagement unless the parties agree otherwise in writing.'

export const foundFields: Record<string, FieldState> = {
  'client.name': {
    value: 'Acme Holdings LLC',
    status: 'verified',
    sources: [
      src('D6', 1, 'The name of the limited liability company is ACME HOLDINGS, L.L.C.'),
      src('D1', 1, 'ACME HOLDINGS, L.L.C., a Delaware limited liability company')
    ],
    note: 'Normalized from “ACME HOLDINGS, L.L.C.”'
  },
  'client.address': {
    value: '500 Market Street, Suite 1200, San Francisco, CA 94105',
    status: 'verified',
    sources: [src('D1', 1, '500 Market Street, Suite 1200, San Francisco, CA 94105')]
  },
  'client.signatory': {
    value: 'Dana Whitfield, General Counsel',
    status: 'verified',
    sources: [src('D5', undefined, 'I’ll sign the engagement letter on Acme’s behalf.', 'Message body')]
  },
  'matter.description': {
    value: 'Series C financing and vendor contract review',
    status: 'verified',
    sources: [src('D2', 3, 'Matter: Series C financing and vendor contract review.')]
  },
  governingLaw: {
    value: 'California',
    status: 'verified',
    sources: [src('D1', 12, 'governed by the laws of the State of California')]
  },
  'fee.basis': {
    value: 'hourly',
    display: 'Hourly',
    status: 'verified',
    sources: [src('D2', 3, 'Services are billed hourly at the rates in Schedule A.')]
  },
  'fee.cap': {
    value: 180000,
    display: '$180,000',
    status: 'verified',
    sources: [src('D2', 3, 'not to exceed $180,000 without Client’s written approval')]
  },
  retainer: {
    value: 25000,
    display: '$25,000',
    status: 'verified',
    sources: [src('D5', undefined, 'a retainer of $25,000, applied to the final invoice', 'Message body')]
  },
  paymentTerms: {
    value: 'Net 30',
    status: 'verified',
    sources: [src('D1', 9, 'within thirty (30) days of the invoice date')],
    note: 'Normalized from “thirty (30) days”'
  },
  includesLitigation: {
    value: false,
    display: 'No',
    status: 'verified',
    sources: [src('D3', 1, 'Litigation is out of scope for now')]
  },
  'firm.signatory': {
    value: 'Morgan Reyes, Partner',
    status: 'approved',
    sources: [],
    by: 'user',
    note: 'Set by you'
  }
}

export const effectiveDateConflict: FieldState = {
  value: null,
  status: 'conflict',
  sources: [],
  candidates: [
    {
      value: '2026-12-01',
      display: '1 December 2026',
      sources: [src('D7', 1, 'Services are effective 1 December 2026')]
    },
    {
      value: '2026-11-01',
      display: '1 November 2026',
      sources: [src('D2', 2, 'commence November 1, 2026')]
    }
  ]
}

export const billingMissing: FieldState = {
  value: null,
  status: 'missing',
  sources: [src('D3', 1, 'Action: Dana to send billing contact for invoices.')],
  note: 'Searched 8 documents for “billing”, “invoice”, “accounts payable”'
}

export const scopeWaiting: FieldState = {
  value: null,
  status: 'empty',
  sources: [],
  note: 'Written after the open questions are answered'
}

export const foundRates: RatesState = {
  status: 'verified',
  rows: [
    { key: 'Partner', role: 'Partner', rate: 650, source: src('D4', undefined, 'Partner 650', 'Rates!B2:C2') },
    { key: 'Senior Associate', role: 'Senior Associate', rate: 425, source: src('D4', undefined, 'Senior Associate 425', 'Rates!B3:C3') },
    { key: 'Associate', role: 'Associate', rate: 310, source: src('D4', undefined, 'Associate 310', 'Rates!B4:C4') },
    { key: 'Paralegal', role: 'Paralegal', rate: 180, source: src('D4', undefined, 'Paralegal 180', 'Rates!B5:C5') }
  ]
}

export const scopeSources: SourceRef[] = [
  src('D3', 1, 'lead counsel on the Series C financing; review of the top 20 vendor contracts before closing'),
  src('D3', 1, 'Litigation is out of scope for now'),
  src('D2', 3, 'Matter: Series C financing and vendor contract review.')
]

export function initialFields(): Record<string, FieldState> {
  return {
    ...structuredClone(foundFields),
    effectiveDate: structuredClone(effectiveDateConflict),
    'billing.email': structuredClone(billingMissing),
    scopeSummary: structuredClone(scopeWaiting)
  }
}

export function emptyFields(): Record<string, FieldState> {
  const out: Record<string, FieldState> = {}
  for (const id of Object.keys(fieldDefs)) out[id] = { value: null, status: 'empty', sources: [] }
  out['firm.signatory'] = structuredClone(foundFields['firm.signatory'])
  return out
}

export function openQuestions(id: string): QuestionSet {
  return {
    id,
    title: 'Two answers needed',
    reason: 'One conflict and one missing value',
    items: [
      {
        fieldId: 'effectiveDate',
        label: 'Which effective date should the letter use?',
        help: 'Amendment 1 was signed after the SOW.',
        kind: 'choice',
        options: effectiveDateConflict.candidates!.map((c) => ({
          value: String(c.value),
          display: c.display,
          sources: c.sources
        }))
      },
      {
        fieldId: 'billing.email',
        label: 'Where should invoices go?',
        help: 'The kickoff notes say Dana would send a billing contact. No document has one.',
        kind: 'text',
        inputType: 'email',
        placeholder: 'name@acmeholdings.com'
      }
    ]
  }
}

export const initialMessages: AppUIMessage[] = [
  {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'Fill the engagement letter for Acme from everything I uploaded.' }]
  },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'text',
        text: 'Reading 7 indexed documents and matching them to the 15 items in **Engagement Letter v2.1**.',
        state: 'done'
      },
      {
        type: 'dynamic-tool',
        toolName: 'search_documents',
        toolCallId: 'c1',
        title: 'Searched documents · 6 queries',
        state: 'output-available',
        input: { queries: ['client legal name', 'principal office', 'signatory', 'fees', 'payment', 'governing law'], k: 8 },
        output: { hits: 31, documents: ['D1', 'D2', 'D3', 'D5', 'D6', 'D7'] }
      },
      {
        type: 'dynamic-tool',
        toolName: 'get_sheet_range',
        toolCallId: 'c2',
        title: 'Read Rate_card_FY27.xlsx · Rates!B2:C5',
        state: 'output-available',
        input: { docId: 'D4', sheet: 'Rates', range: 'B2:C5' },
        output: { rows: 4 }
      },
      {
        type: 'dynamic-tool',
        toolName: 'set_field',
        toolCallId: 'c3',
        title: 'Filled 12 items · every quote verified',
        state: 'output-available',
        input: { fields: 11, rows: 4 },
        output: { verified: 12, quoteChecks: '16 of 16 passed' }
      },
      {
        type: 'text',
        text:
          'Two things need you before I write the scope summary:\n\n' +
          '- **Effective date.** The SOW says November 1, 2026. Amendment 1 moves it to December 1, 2026.\n' +
          '- **Billing contact.** The kickoff notes say Dana would send one, but no document has it.',
        state: 'done'
      },
      { type: 'data-question', id: 'q1', data: openQuestions('q1') }
    ]
  }
]
