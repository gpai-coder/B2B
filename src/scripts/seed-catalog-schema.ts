import { z } from 'zod'

import { PRODUCT_DOCUMENT_TYPES } from '@/collections/product-document-types'

const specsSchema = z
  .object({
    flowRateGpm: z.number().optional(),
    spoutHeightIn: z.number().optional(),
    material: z.string().optional(),
    certifications: z.string().optional(),
  })
  .optional()

const documentSchema = z.object({
  docType: z.enum(PRODUCT_DOCUMENT_TYPES),
  /** Path relative to the catalog dataset root (directory containing products.json). */
  file: z.string().min(1),
  displayName: z.string().optional(),
})

const variantSchema = z.object({
  sku: z.string().min(1),
  finish: z.string().min(1),
  name: z.string().min(1),
  listPrice: z.number().positive(),
  /** Relative paths to image files under the dataset root. */
  images: z.array(z.string().min(1)).default([]),
  documents: z.array(documentSchema).default([]),
  specs: specsSchema,
})

export const seedCatalogSchema = z.object({
  version: z.literal(1),
  /** Optional note for operators (e.g. American Standard import batch id). */
  label: z.string().optional(),
  products: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      productCollection: z.string().min(1),
      description: z.string().optional(),
      featureBullets: z.array(z.object({ text: z.string().min(1) })).default([]),
      specsTable: z
        .array(z.object({ label: z.string().min(1), value: z.string().min(1) }))
        .default([]),
      /** Relative path; omit to use placeholder image on PLP/PDP. */
      primaryImage: z.string().min(1).optional(),
      gallery: z.array(z.string().min(1)).default([]),
      variants: z.array(variantSchema).min(1),
    }),
  ),
})

export type SeedCatalogFile = z.infer<typeof seedCatalogSchema>
export type SeedCatalogProduct = SeedCatalogFile['products'][number]
export type SeedCatalogVariant = SeedCatalogProduct['variants'][number]

export function parseSeedCatalogFile(raw: unknown): SeedCatalogFile {
  return seedCatalogSchema.parse(raw)
}
