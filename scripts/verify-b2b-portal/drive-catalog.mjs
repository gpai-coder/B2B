#!/usr/bin/env node
/**
 * Drive catalog search → PDP (vendor login). Writes screenshots + log under artifacts/.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

import { artifactsDir, baseUrl, loadVerificationEnv } from './lib/env.mjs'

const runId = process.env.VERIFY_RUN_ID ?? `run-${Date.now()}`
const outDir = artifactsDir(runId)
const logPath = path.join(outDir, 'catalog-drive.log')

loadVerificationEnv()

const email = process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local'
const password = process.env.SEED_VENDOR_A_PASSWORD ?? 'local-dev-vendor-a-password'
const origin = baseUrl()

const lines = []
function log(line) {
  lines.push(line)
  process.stdout.write(`${line}\n`)
}

const browser = await chromium.launch({ channel: 'chromium', headless: true })
const context = await browser.newContext({ baseURL: origin })
const page = await context.newPage()

try {
  await page.goto(`/login?next=${encodeURIComponent('/catalog')}`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })

  await page.screenshot({ path: path.join(outDir, '01-catalog-after-login.png'), fullPage: true })

  const search = page.getByTestId('catalog-search-input')
  await search.fill('7353101')
  await page.getByTestId('catalog-search-suggest').waitFor({ state: 'visible', timeout: 20_000 })
  await page.screenshot({ path: path.join(outDir, '02-catalog-typeahead.png'), fullPage: true })

  await page.getByTestId('catalog-search-suggest').getByRole('link').first().click()
  await page.waitForURL('**/products/**')
  await page.getByTestId('product-page').waitFor({ state: 'visible', timeout: 20_000 })
  await page.screenshot({ path: path.join(outDir, '03-product-pdp.png'), fullPage: true })

  log(`catalog-drive: OK (PDP ${page.url()})`)
} finally {
  await browser.close()
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`)
}
