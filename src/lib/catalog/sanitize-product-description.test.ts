import fs from 'fs'
import path from 'path'

import { describe, expect, it } from 'vitest'

import { sanitizeProductDescription } from '@/lib/catalog/sanitize-product-description'

const CHAMPION_DESCRIPTION = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'scripts/seed/catalog/products.json'),
    'utf8',
  ),
).products.find(
  (p: { slug?: string }) =>
    p.slug === 'champion-r-4-one-piece-1-6-gpf-6-0-lpf-chair-height-elongated-toilet-with-seat',
)?.description as string

describe('sanitizeProductDescription', () => {
  it('returns empty for nullish input', () => {
    expect(sanitizeProductDescription(null)).toBe('')
    expect(sanitizeProductDescription(undefined)).toBe('')
  })

  it('keeps Champion copy and removes trailing brand-icons CSS', () => {
    expect(CHAMPION_DESCRIPTION).toBeTruthy()
    const cleaned = sanitizeProductDescription(CHAMPION_DESCRIPTION)
    expect(cleaned).toContain('high with an elongated shape')
    expect(cleaned).toContain('slamming.')
    expect(cleaned).not.toMatch(/brand-icons/)
    expect(cleaned).not.toMatch(/var\(--brand/)
  })

  it('does not strip brace text that is not CSS declarations', () => {
    expect(sanitizeProductDescription('Flow rate 1.2 gpm {at 60 psi} rated.')).toBe(
      'Flow rate 1.2 gpm {at 60 psi} rated.',
    )
    expect(sanitizeProductDescription('chair-height bowl is 16 ½-in. high')).toContain('½-in.')
  })

  it('removes style tags and trailing CSS blocks from mixed content', () => {
    const raw =
      'Clog-free performance. <style>.x{color:red}</style> .brand-icons img { width: 10px; } @media (min-width: 1024px) { .brand-icons img { width: 20px; } }'
    expect(sanitizeProductDescription(raw)).toBe('Clog-free performance.')
  })

  const xssSamples = [
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<a href="javascript:alert(1)" onclick=alert(1)>link</a>',
    '</script >',
    '<style>.x{color:red}',
    '<scr<script>x</script>ipt>alert(1)</script>',
  ]

  it.each(xssSamples)('strips markup from %s', (sample) => {
    const out = sanitizeProductDescription(sample)
    expect(out).not.toMatch(/<[^>]*>/)
    expect(out.toLowerCase()).not.toContain('onerror')
    expect(out.toLowerCase()).not.toContain('onload')
    expect(out.toLowerCase()).not.toContain('javascript:')
    expect(out.toLowerCase()).not.toContain('<script')
    expect(out.toLowerCase()).not.toContain('<style')
  })
})
