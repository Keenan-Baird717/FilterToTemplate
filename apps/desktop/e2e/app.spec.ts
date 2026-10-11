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

test('fills the engagement letter after the user answers follow-ups', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'ftt-export-'))
  const app = await electron.launch({
    args: ['.', ...(isRoot ? ['--no-sandbox'] : []), ...(shots ? ['--force-device-scale-factor=2'] : [])],
    cwd: join(__dirname, '..'),
    env: { ...process.env, FTT_EXPORT_DIR: exportDir }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

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
