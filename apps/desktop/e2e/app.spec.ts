import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import PizZip from 'pizzip'

// Drives the built app (run `pnpm build` first): opens the example project,
// answers the agent's follow-up questions and checks the fill state updates.
// Set SCREENSHOT_DIR to also save screenshots of each step.

const shots = process.env['SCREENSHOT_DIR']
const isRoot = process.getuid?.() === 0

async function snap(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

function launch(env: Record<string, string> = {}) {
  return electron.launch({
    args: ['.', ...(isRoot ? ['--no-sandbox'] : []), ...(shots ? ['--force-device-scale-factor=2'] : [])],
    cwd: join(__dirname, '..'),
    env: { ...(process.env as Record<string, string>), ...env }
  })
}

test('opens on Trail and keeps a history of every value', async () => {
  const app = await launch()
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const prototypes = page.getByRole('navigation', { name: 'Prototypes' })
  await expect(prototypes.getByRole('button', { name: /^Trail/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Engagement Letter' })).toBeVisible()

  // Questions wait in the tray above the fields, not in the chat.
  const tray = page.getByRole('region', { name: 'Questions for you' })
  await tray.getByRole('button', { name: 'Answer' }).click()
  // The whole tile picks the option, so click its label the way a person would.
  await tray.locator('label', { hasText: '1 December 2026' }).click()
  await expect(tray.getByRole('radio', { name: '1 December 2026' })).toBeChecked()
  await tray.getByLabel('Where should invoices go?').fill('ap@acmeholdings.com')
  await snap(page, 'trail-01-tray')
  await tray.getByRole('button', { name: 'Send answers' }).click()
  await expect(page.getByText('Ready to export')).toBeVisible({ timeout: 20_000 })

  // Each value keeps its history: the agent's two candidates, then your choice.
  await page.locator('#field-effectiveDate').getByRole('button', { name: /^History of Effective date: 2 changes/ }).click()
  const history = page.getByRole('list', { name: 'History of Effective date' })
  await expect(history).toContainText('You chose')
  await expect(history).toContainText('found two values')
  await snap(page, 'trail-02-history')
  await page.keyboard.press('Escape')

  // An edit can be undone from the value's history.
  const feeCap = page.locator('#field-fee\\.cap')
  await feeCap.getByRole('button', { name: 'Edit Fee cap' }).click()
  await feeCap.getByRole('textbox').fill('$200,000')
  await page.keyboard.press('Enter')
  await expect(feeCap).toContainText('$200,000')
  await feeCap.getByRole('button', { name: /^History of Fee cap/ }).click()
  await page.getByRole('button', { name: 'Undo my edit' }).click()
  await expect(feeCap).toContainText('$180,000')

  // The rail opens onto the activity trail.
  await page.getByRole('button', { name: /^Show activity/ }).click()
  await expect(page.getByRole('list', { name: 'Activity, newest first' }).first()).toContainText('You chose 1 December 2026 for Effective date')
  await snap(page, 'trail-03-activity')

  await app.close()
})

test('fills the engagement letter after the user answers follow-ups', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'ftt-export-'))
  const app = await launch({ FTT_EXPORT_DIR: exportDir })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // The app opens on Trail; this walkthrough covers Workbench, the base design.
  await page.getByRole('navigation', { name: 'Prototypes' }).getByRole('button', { name: /^Workbench/ }).click()
  await expect(page.getByRole('heading', { name: 'Engagement Letter' })).toBeVisible()
  await expect(page.getByText('Simulated agent · utility process')).toBeVisible()
  await expect(page.getByText('12', { exact: true }).first()).toBeVisible()
  await snap(page, '01-fields-light')

  // The Word preview shows what's still missing as placeholders.
  await page.getByRole('tab', { name: 'Preview' }).click()
  const preview = page.getByLabel('Letter preview')
  await expect(preview.locator('section.docx').first()).toBeVisible()
  await expect(preview.locator('.ftt-missing', { hasText: 'Billing contact email' })).toBeVisible()
  await snap(page, '02a-docx-preview-gaps')
  await page.getByRole('tab', { name: 'Fields' }).click()

  await page.locator('#field-effectiveDate').getByRole('button').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('mark')).toContainText('effective 1 December 2026')
  await snap(page, '02-source-viewer')
  await page.keyboard.press('Escape')

  await page.getByLabel('1 December 2026').check()
  await page.getByLabel('Where should invoices go?').fill('ap@acmeholdings.com')
  await page.getByRole('button', { name: 'Send answers' }).click()

  await expect(page.locator('#field-scopeSummary')).toContainText('Writing', { timeout: 15_000 })
  await snap(page, '03-agent-writing')
  await expect(page.getByText('Ready to export')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#field-billing\\.email')).toContainText('ap@acmeholdings.com')
  await snap(page, '04-filled')

  await page.getByRole('tab', { name: 'Preview' }).click()
  await expect(preview).toContainText('Series C financing')
  await expect(preview.locator('.ftt-missing')).toHaveCount(0)
  await expect(preview.locator('.ftt-val', { hasText: 'ap@acmeholdings.com' })).toBeVisible()
  await snap(page, '05-preview-light')

  // Clicking a value in the document jumps to its field.
  await preview.locator('.ftt-val', { hasText: 'ap@acmeholdings.com' }).click()
  await expect(page.getByRole('tab', { name: 'Fields' })).toHaveAttribute('data-state', 'active')

  // Export writes a real .docx with every tag filled.
  await page.getByRole('button', { name: 'Export .docx' }).click()
  await expect(page.getByText('Saved Engagement Letter - Acme Holdings.docx')).toBeVisible()
  const xml = new PizZip(readFileSync(join(exportDir, 'Engagement Letter - Acme Holdings.docx'))).file('word/document.xml')!.asText()
  const text = xml.replace(/<[^>]+>/g, '')
  expect(text).toContain('ap@acmeholdings.com')
  expect(text).toContain('1 December 2026')
  expect(text).not.toMatch(/[{}\uE000-\uE003]/)
  await page.getByRole('tab', { name: 'Preview' }).click()

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await snap(page, '06-preview-dark')
  await page.getByRole('tab', { name: 'Fields' }).click()
  await snap(page, '07-fields-dark')

  await app.close()
})
