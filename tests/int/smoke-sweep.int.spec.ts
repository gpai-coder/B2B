import { describe, expect, it } from 'vitest'

import {
  isSmokeSweepMediaAlt,
  isSmokeSweepProductSlug,
  isSmokeSweepVariantSku,
} from '../helpers/smoke-artifact-matchers'

describe('smoke sweep matchers', () => {
  it('does not match real catalog slugs or skus that merely contain smoke', () => {
    expect(isSmokeSweepVariantSku('AS-SMOKE-GLASS-01')).toBe(false)
    expect(isSmokeSweepProductSlug('frosted-smoke-glass-shower-panel')).toBe(false)
    expect(isSmokeSweepMediaAlt('Spec AS-SMOKE-GLASS-01')).toBe(false)
  })

  it('matches only strict smoke e2e artifact markers', () => {
    expect(isSmokeSweepProductSlug('smoke-1735923456789-faucet')).toBe(true)
    expect(isSmokeSweepVariantSku('smoke-1735923456789-sku')).toBe(true)
    expect(isSmokeSweepMediaAlt('Spec smoke-1735923456789-sku')).toBe(true)
    expect(isSmokeSweepProductSlug('smoke-17359234567-faucet')).toBe(false)
    expect(isSmokeSweepVariantSku('smoke-1735923456789-extra')).toBe(false)
  })
})
