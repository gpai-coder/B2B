import { z } from 'zod'

import {
  PRODUCT_DOCUMENT_TYPES,
  PRODUCT_EXTERNAL_RESOURCE_TYPES,
} from '@/collections/product-document-types'

const specsSchema = z
  .object({
    flowRateGpm: z.number().optional(),
    spoutHeightIn: z.number().optional(),
    material: z.string().optional(),
    certifications: z.string().optional(),
  })
  .optional()

const documentSchema = z
  .object({
    docType: z.enum([...PRODUCT_DOCUMENT_TYPES, ...PRODUCT_EXTERNAL_RESOURCE_TYPES]),
    file: z.string().min(1).optional(),
    externalUrl: z.string().url().optional(),
    displayName: z.string().optional(),
  })
  .refine((d) => Boolean(d.file || d.externalUrl), {
    message: 'document requires file or externalUrl',
  })

const variantSchema = z.object({
  sku: z.string().min(1),
  finish: z.string().min(1),
  name: z.string().min(1),
  /** Standard list / contract baseline unit price (Shopify current price). */
  listPrice: z.number().positive(),
  msrp: z.number().positive().optional(),
  upc: z.string().optional(),
  inStock: z.boolean().default(true),
  discontinued: z.boolean().default(false),
  images: z.array(z.string().min(1)).default([]),
  specs: specsSchema,
})

const specGroupSchema = z.object({
  groupName: z.string().min(1),
  rows: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })),
})

export const seedCatalogSchema = z.object({
  version: z.literal(1),
  label: z.string().optional(),
  products: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      modelNumber: z.string().min(1).optional(),
      productCollection: z.string().min(1),
      catalogCategory: z
        .enum(['bathroom-faucet', 'kitchen-faucet', 'toilet'])
        .optional(),
      breadcrumbs: z.array(z.object({ label: z.string().min(1) })).default([]),
      description: z.string().optional(),
      shortBullets: z.array(z.object({ text: z.string().min(1) })).default([]),
      featureBullets: z.array(z.object({ text: z.string().min(1) })).default([]),
      specGroups: z.array(specGroupSchema).default([]),
      specsTable: z
        .array(z.object({ label: z.string().min(1), value: z.string().min(1) }))
        .default([]),
      documents: z.array(documentSchema).default([]),
      youtubeVideoId: z.string().optional(),
      facetMeta: z
        .object({
          handleType: z.string().optional(),
          holesRequired: z.string().optional(),
          ada: z.string().optional(),
          bowlShape: z.string().optional(),
          flushTechnology: z.string().optional(),
          gpf: z.string().optional(),
        })
        .optional(),
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
