import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FRONTEND_ROOT = path.join('src', 'app', '(frontend)')

function walkTsFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const name of entries) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) files.push(...walkTsFiles(full))
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) files.push(full)
  }
  return files
}

describe('storefront import boundary', () => {
  it('does not import the payload package under app/(frontend)', () => {
    const files = walkTsFiles(FRONTEND_ROOT)
    const violations: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (/from\s+['"]payload['"]/.test(text) || /require\s*\(\s*['"]payload['"]\s*\)/.test(text)) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })

  it('server actions under storefront use getCommerce for cart/checkout/quote order', () => {
    const actionFiles = [
      'src/app/(frontend)/cart/actions.ts',
      'src/app/(frontend)/checkout/actions.ts',
      'src/app/(frontend)/quick-order/actions.ts',
      'src/app/(frontend)/quotes/[quoteNumber]/order/actions.ts',
    ]
    for (const file of actionFiles) {
      const text = readFileSync(file, 'utf8')
      expect(text).toMatch(/getCommerce/)
      expect(text).not.toMatch(/payload\.(create|update|delete)/)
    }
  })
})
