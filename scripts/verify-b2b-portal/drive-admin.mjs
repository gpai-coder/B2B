#!/usr/bin/env node
/**
 * Staff admin login and dashboard smoke. Writes screenshots under artifacts/.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

import { artifactsDir, baseUrl, loadVerificationEnv } from './lib/env.mjs'

const runId = process.env.VERIFY_RUN_ID ?? `run-${Date.now()}`
const outDir = artifactsDir(runId)
const logPath = path.join(outDir, 'admin-drive.log')

loadVerificationEnv()

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test'
const password = process.env.SEED_ADMIN_PASSWORD ?? 'local-dev-admin-password'
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
  await page.goto('/admin/login')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /^login$/i }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'), {
    timeout: 30_000,
  })
  await page.screenshot({ path: path.join(outDir, '04-admin-dashboard.png'), fullPage: true })

  await page.goto('/admin/collections/users')
  await page.getByRole('heading', { name: 'Users' }).waitFor({ state: 'visible', timeout: 20_000 })
  await page.screenshot({ path: path.join(outDir, '05-admin-users-list.png'), fullPage: true })

  log(`admin-drive: OK (${origin}/admin)`)
} finally {
  await browser.close()
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`)
}
