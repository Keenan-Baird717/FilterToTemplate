// Generates templates/engagement-letter/layout.docx, the sample Word layout.
// In a real project this file is authored and branded in Word by the team;
// it is generated here so the tags are guaranteed not to be split across runs.
//
//   node scripts/build-sample-template.mts

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions
} from 'docx'

const INK = '1D1F24'
const MUTED = '6B7280'
const RULE = 'C9CDD4'

const p = (runs: (string | TextRun)[], opts: { after?: number; bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 160 },
    children: runs.map((r) => (typeof r === 'string' ? new TextRun({ text: r, bold: opts.bold }) : r))
  })

const heading = (text: string) =>
  new Paragraph({ spacing: { before: 280, after: 120 }, keepNext: true, children: [new TextRun({ text, bold: true })] })

const none: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const noBorders = { top: none, bottom: none, left: none, right: none }
const hairline: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: RULE }

// Hourly rates: a table-row loop. {#hourlyRates} opens in the first cell and
// {/hourlyRates} closes in the last, so docxtemplater repeats the whole row.
const RATE_COLS = [3600, 1800]
const rateCell = (text: string, width: number, opts: { header?: boolean; right?: boolean } = {}) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: { top: none, left: none, right: none, bottom: hairline },
    shading: opts.header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F4F6' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.header, font: 'Calibri', size: 20 })]
      })
    ]
  })

const ratesTable = new Table({
  width: { size: RATE_COLS[0] + RATE_COLS[1], type: WidthType.DXA },
  columnWidths: RATE_COLS,
  rows: [
    new TableRow({ tableHeader: true, children: [rateCell('Role', RATE_COLS[0], { header: true }), rateCell('Hourly rate', RATE_COLS[1], { header: true, right: true })] }),
    new TableRow({ children: [rateCell('{#hourlyRates}{role}', RATE_COLS[0]), rateCell('{rate}{/hourlyRates}', RATE_COLS[1], { right: true })] })
  ]
})

// Signature blocks: a borderless two-column table.
const SIG_COLS = [4680, 4680]
const sigCell = (lines: Paragraph[]) =>
  new TableCell({ width: { size: SIG_COLS[0], type: WidthType.DXA }, borders: noBorders, children: lines })
const sigLine = (text: string) =>
  new Paragraph({
    spacing: { before: 520, after: 40 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 4 } },
    children: [new TextRun({ text, font: 'Calibri', size: 20 })]
  })
const small = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, font: 'Calibri', size: 20, bold, characterSpacing: bold ? 20 : 0 })] })

const signatures = new Table({
  width: { size: SIG_COLS[0] + SIG_COLS[1], type: WidthType.DXA },
  columnWidths: SIG_COLS,
  borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
  rows: [
    new TableRow({
      children: [
        sigCell([small('CALDER & REYES LLP', true), sigLine('{firm.signatory}')]),
        sigCell([small('ACKNOWLEDGED: {client.name}', true), sigLine('{client.signatory}')])
      ]
    })
  ]
})

const doc = new Document({
  creator: 'FilterToTemplate',
  title: 'Engagement Letter',
  styles: {
    default: {
      document: { run: { font: 'Georgia', size: 22, color: INK }, paragraph: { spacing: { line: 276 } } }
    }
  },
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'CALDER & REYES LLP', bold: true, size: 20, characterSpacing: 60 })] }),
        new Paragraph({
          spacing: { after: 480 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 10 } },
          children: [new TextRun({ text: '1 Embarcadero Center, Suite 2400 · San Francisco, CA 94111', font: 'Calibri', size: 17, color: MUTED })]
        }),
        p(['{letterDate}'], { after: 320 }),
        p(['{client.signatory}'], { after: 0 }),
        p(['{client.name}'], { after: 0 }),
        p(['{client.address}'], { after: 320 }),
        p([new TextRun({ text: 'Re: Engagement letter · ', bold: true }), new TextRun({ text: '{matter.description}', bold: true })], { after: 280 }),
        p(['Dear {salutation},']),
        p([
          'Thank you for selecting Calder & Reyes LLP. This letter confirms the terms on which we will represent ',
          '{client.name}',
          ' in connection with the matter above, effective ',
          '{effectiveDate}',
          '.'
        ]),
        heading('1. Scope of engagement'),
        // Paragraph loop: the agent's narrative arrives as a list of paragraphs.
        p(['{#scopeParagraphs}'], { after: 0 }),
        p(['{text}']),
        p(['{/scopeParagraphs}'], { after: 0 }),
        p(["{includesLitigation ? '☒' : '☐'} Litigation support included"]),
        heading('2. Fees and billing'),
        p([
          '{#isHourly}We will bill on an hourly basis at the rates below. {/isHourly}{^isHourly}We will bill a fixed fee. {/isHourly}',
          'Total fees will not exceed ',
          '{fee.cap}',
          ' without your written approval.'
        ]),
        ratesTable,
        new Paragraph({ spacing: { after: 160 }, children: [] }),
        p([
          'You agree to pay a retainer of ',
          '{retainer}',
          ', applied to our final invoice. Invoices are payable ',
          '{paymentTerms}',
          ' and will be sent to ',
          '{billing.email}',
          '.'
        ]),
        heading('3. Governing law'),
        p(['This letter is governed by the laws of the State of ', '{governingLaw}', '.'], { after: 480 }),
        signatures
      ]
    }
  ]
})

const out = fileURLToPath(new URL('../templates/engagement-letter/layout.docx', import.meta.url))
writeFileSync(out, await Packer.toBuffer(doc))
console.log(`wrote ${out}`)
