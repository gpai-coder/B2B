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
          productCollection: 'Faucets',
          variants: [
            {
              sku: 'DEMO-1',
              finish: 'Chrome',
              name: 'Demo Chrome',
              listPrice: 10,
              documents: [{ docType: 'spec-sheet', file: 'assets/docs/spec.pdf' }],
            },
          ],
        },
      ],
    })
    expect(parsed.products[0]?.variants[0]?.documents[0]?.docType).toBe('spec-sheet')
  })
})
