import { describe, it, expect } from 'vitest'

import { parseSeedCatalogFile } from './seed-catalog-schema'

describe('seed catalog schema', () => {
  it('parses version 1 demo shape', () => {
    const parsed = parseSeedCatalogFile({
      version: 1,
      products: [
        {
          slug: 'demo',
          name: 'Demo',
          productCollection: 'Townsend',
          documents: [{ docType: 'spec-sheet', file: 'assets/7353101/docs/spec.pdf' }],
          variants: [
            {
              sku: '7353101.002',
              finish: 'Chrome',
              name: 'Demo Chrome',
              listPrice: 234,
              msrp: 360,
            },
          ],
        },
      ],
    })
    expect(parsed.products[0]?.documents[0]?.docType).toBe('spec-sheet')
  })
})
