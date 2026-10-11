// Builds the browser version into OUT_DIR and screenshots one prototype at
// desktop and phone widths, light and dark. Reports console errors and any
// horizontal page overflow.
//
//   node scripts/shoot-variant.mjs <variant-id> <out-dir> [--no-build]

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const [variant, outArg, flag] = process.argv.slice(2)
if (!variant || !outArg) {
  console.error('usage: node scripts/shoot-variant.mjs <variant-id> <out-dir> [--no-build]')
  process.exit(2)
}
const out = resolve(outArg)
const site = join(out, 'site')
mkdirSync(out, { recursive: true })

if (flag !== '--no-build') {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.web.config.ts', '--outDir', site, '--logLevel', 'error'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_ONLY_VARIANT: variant }
  })
}

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath })
const errors = []
const shots = [
  ['desktop-light', { width: 1440, height: 900 }, 'light'],
  ['desktop-dark', { width: 1440, height: 900 }, 'dark'],
  ['phone-light', { width: 400, height: 860 }, 'light']
]
for (const [name, viewport, scheme] of shots) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1.5, colorScheme: scheme })
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  await page.goto(`file://${join(site, 'index.html')}#${variant}`)
  await page.waitForTimeout(1500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const file = join(out, `${variant}-${name}.png`)
  await page.screenshot({ path: file })
  console.log(`${file}  horizontal overflow: ${overflow}px`)
  await page.close()
}
await browser.close()
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'console errors: none')
