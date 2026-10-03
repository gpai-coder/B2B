import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv()

import { defineConfig, devices } from '@playwright/test'

const baseURL =
  process.env.B2B_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

const useLocalServer = baseURL.includes('localhost') || baseURL.includes('127.0.0.1')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: useLocalServer
    ? {
        command: 'pnpm db:migrate && pnpm db:seed && pnpm dev',
        reuseExistingServer: !process.env.CI,
        url: baseURL,
        timeout: 180_000,
      }
    : undefined,
})
