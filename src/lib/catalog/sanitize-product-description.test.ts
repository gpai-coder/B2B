import { describe, expect, it } from 'vitest'

import { sanitizeProductDescription } from '@/lib/catalog/sanitize-product-description'

describe('sanitizeProductDescription', () => {
  it('removes style tags and trailing CSS blocks from plain text', () => {
    const raw =
      'Clog-free performance. <style>.x{color:red}</style> .brand-icons img { width: 10px; } @media (min-width: 1024px) { .brand-icons img { width: 20px; } }'
    expect(sanitizeProductDescription(raw)).toBe('Clog-free performance.')
  })

  it('returns empty for nullish input', () => {
    expect(sanitizeProductDescription(null)).toBe('')
    expect(sanitizeProductDescription(undefined)).toBe('')
  })
})
