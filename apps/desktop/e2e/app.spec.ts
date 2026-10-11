import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Page } from '@playwright/test'

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
  const app = await electron.launch({
    args: ['.', ...(isRoot ? ['--no-sandbox'] : []), ...(shots ? ['--force-device-scale-factor=2'] : [])],
    cwd: join(__dirname, '..')
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByRole('heading', { name: 'Engagement Letter' })).toBeVisible()
  await expect(page.getByText('Simulated agent · utility process')).toBeVisible()
  await expect(page.getByText('12', { exact: true }).first()).toBeVisible()
  await snap(page, '01-fields-light')

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
  await expect(page.getByLabel('Letter preview')).toContainText('Series C financing')
  await snap(page, '05-preview-light')

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await snap(page, '06-preview-dark')
  await page.getByRole('tab', { name: 'Fields' }).click()
  await snap(page, '07-fields-dark')

  await app.close()
})
