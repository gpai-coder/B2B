import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const vercelBuildScript = readFileSync('scripts/vercel-build.sh', 'utf8')

describe('vercel-build.sh guard', () => {
  it('exits before build when VERCEL=1 and VERCEL_ENV is empty', () => {
    expect(() =>
      execFileSync('bash', ['scripts/vercel-build.sh'], {
        env: {
          ...process.env,
          VERCEL: '1',
          VERCEL_ENV: '',
          PATH: process.env.PATH,
        },
        stdio: 'pipe',
      }),
    ).toThrow()
  })
})

describe('vercel-build.sh migrate branches', () => {
  it('runs payload migrate for production and preview with distinct log lines', () => {
    expect(vercelBuildScript).toMatch(/production\)/)
    expect(vercelBuildScript).toMatch(/Running Payload migrations \(production\)/)
    expect(vercelBuildScript).toMatch(/preview\)/)
    expect(vercelBuildScript).toMatch(/Running Payload migrations \(preview\)/)
    expect(vercelBuildScript).toMatch(
      /cross-env NODE_ENV=production PAYLOAD_DISABLE_PUSH=true NODE_OPTIONS=--no-deprecation payload migrate/,
    )
    const migrateCommandCount = (
      vercelBuildScript.match(
        /cross-env NODE_ENV=production PAYLOAD_DISABLE_PUSH=true NODE_OPTIONS=--no-deprecation payload migrate/g,
      ) ?? []
    ).length
    expect(migrateCommandCount).toBe(2)
  })

  it('still runs pnpm build after migrate branches', () => {
    expect(vercelBuildScript).toMatch(/pnpm run build/)
  })

  it('refuses empty VERCEL_ENV when VERCEL=1 in script', () => {
    expect(vercelBuildScript).toMatch(/VERCEL=1 but VERCEL_ENV is empty/)
  })
})
