import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

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
