import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CI_WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('CI migration safety', () => {
  it('sets PAYLOAD_DISABLE_PUSH=true on migrate, seed, build, and e2e steps', () => {
    const envLines = CI_WORKFLOW.split('\n').filter((line) =>
      /^\s+PAYLOAD_DISABLE_PUSH:\s*['"]true['"]/.test(line),
    )
    expect(envLines.length).toBeGreaterThanOrEqual(4)
  })

  it('runs legacy cart reconcile and migrate:check when migrations exist', () => {
    expect(CI_WORKFLOW).toMatch(/migrate-prod-cart-reconcile/)
    expect(CI_WORKFLOW).toMatch(/db:migrate:check/)
  })
})
