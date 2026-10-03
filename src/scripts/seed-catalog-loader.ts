import fs from 'fs'
import path from 'path'

import type { Payload } from 'payload'

import type { ProductDocumentType } from '@/collections/product-document-types'
import type { Order, PriceList, Product, ProductVariant, Quote } from '@/payload-types'

import {
  parseSeedCatalogFile,
  type SeedCatalogFile,
  type SeedCatalogProduct,
  type SeedCatalogVariant,
} from './seed-catalog-schema'

/** Stable idempotency key for uploaded media (stored in `media.filename`). */
export function seedMediaStorageName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return `seed-catalog__${normalized.replace(/\//g, '__')}`
}

export type SeedCatalogLoaderOptions = {
  /** Absolute path to products.json */
  catalogFilePath: string
  /** Absolute path to committed placeholder PNG. */
  placeholderImagePath: string
  placeholderImageAlt: string
}

async function findMediaByStorageName(payload: Payload, storageName: string) {
  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: storageName } },
    limit: 1,
    overrideAccess: true,
  })
  return existing.docs[0] ?? null
}

async function upsertMediaFromFile(
  payload: Payload,
  datasetRoot: string,
  relativePath: string,
  alt: string,
): Promise<{ id: number }> {
  const storageName = seedMediaStorageName(relativePath)
  const existing = await findMediaByStorageName(payload, storageName)
  if (existing) {
    if (existing.alt !== alt) {
      await payload.update({
        collection: 'media',
        id: existing.id,
        data: { alt },
        overrideAccess: true,
      })
    }
    return { id: existing.id }
  }

  const absolutePath = path.resolve(datasetRoot, relativePath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Seed catalog asset missing: ${relativePath} (expected at ${absolutePath})`)
  }

  const buffer = fs.readFileSync(absolutePath)
  const ext = path.extname(relativePath).toLowerCase()
  const mimetype =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : 'application/octet-stream'

  const created = await payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data: buffer,
      mimetype,
      name: storageName,
      size: buffer.length,
    },
    overrideAccess: true,
  })
  return { id: created.id }
}

async function ensurePlaceholderMedia(
  payload: Payload,
  options: SeedCatalogLoaderOptions,
): Promise<number> {
  const relFromCatalog = path.relative(
    path.dirname(options.catalogFilePath),
    options.placeholderImagePath,
  )
  const placeholderRel =
    relFromCatalog && !relFromCatalog.startsWith('..')
      ? relFromCatalog
      : 'assets/product-placeholder.png'

  const datasetRoot = path.dirname(options.catalogFilePath)
  const absolutePlaceholder = path.resolve(datasetRoot, placeholderRel)
  if (!fs.existsSync(absolutePlaceholder)) {
    fs.copyFileSync(options.placeholderImagePath, absolutePlaceholder)
  }

  return (
    await upsertMediaFromFile(payload, datasetRoot, placeholderRel, options.placeholderImageAlt)
  ).id
}

async function resolveImageMediaIds(
  payload: Payload,
  datasetRoot: string,
  relativePaths: string[] | undefined,
  placeholderId: number,
): Promise<number[]> {
  if (!relativePaths?.length) return [placeholderId]
  const ids: number[] = []
  for (const rel of relativePaths) {
    const { id } = await upsertMediaFromFile(payload, datasetRoot, rel, rel)
    ids.push(id)
  }
  return ids
}

async function findOrCreateProductRecord(
  payload: Payload,
  slug: string,
  data: Record<string, unknown>,
) {
  const existing = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'products',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return payload.findByID({
      collection: 'products',
      id: existing.docs[0].id,
      overrideAccess: true,
    })
  }
  return payload.create({
    collection: 'products',
    data: { slug, ...data } as Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    overrideAccess: true,
  })
}

async function findOrCreateVariantRecord(payload: Payload, sku: string, data: Record<string, unknown>) {
  const existing = await payload.find({
    collection: 'product-variants',
    where: { sku: { equals: sku } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'product-variants',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return existing.docs[0]
  }
  return payload.create({
    collection: 'product-variants',
    data: { sku, ...data } as Omit<ProductVariant, 'id' | 'createdAt' | 'updatedAt'>,
    overrideAccess: true,
  })
}

async function seedVariant(
  payload: Payload,
  datasetRoot: string,
  productId: number,
  variant: SeedCatalogVariant,
  placeholderId: number,
  variantBySku: Map<string, { id: number; listPrice: number }>,
) {
  const imageIds = await resolveImageMediaIds(
    payload,
    datasetRoot,
    variant.images,
    placeholderId,
  )
  const documents: Array<{
    docType: ProductDocumentType
    file: number
    displayName?: string
  }> = []
  for (const doc of variant.documents ?? []) {
    const { id } = await upsertMediaFromFile(
      payload,
      datasetRoot,
      doc.file,
      doc.displayName ?? doc.file,
    )
    documents.push({
      docType: doc.docType,
      file: id,
      displayName: doc.displayName,
    })
  }

  const saved = await findOrCreateVariantRecord(payload, variant.sku, {
    name: variant.name,
    product: productId,
    finish: variant.finish,
    specs: variant.specs,
    images: imageIds.map((image) => ({ image })),
    documents,
  })
  variantBySku.set(variant.sku, { id: saved.id, listPrice: variant.listPrice })
}

async function seedProductFromCatalogEntry(
  payload: Payload,
  datasetRoot: string,
  product: SeedCatalogProduct,
  placeholderId: number,
  variantBySku: Map<string, { id: number; listPrice: number }>,
) {
  let primaryImageId = placeholderId
  if (product.primaryImage) {
    primaryImageId = (
      await upsertMediaFromFile(payload, datasetRoot, product.primaryImage, product.name)
    ).id
  }

  const galleryRows = []
  for (const rel of product.gallery ?? []) {
    const { id } = await upsertMediaFromFile(payload, datasetRoot, rel, `${product.name} gallery`)
    galleryRows.push({ image: id })
  }

  const savedProduct = await findOrCreateProductRecord(payload, product.slug, {
    name: product.name,
    productCollection: product.productCollection,
    description: product.description ?? '',
    featureBullets: product.featureBullets,
    specsTable: product.specsTable,
    primaryImage: primaryImageId,
    gallery: galleryRows,
  })

  for (const variant of product.variants) {
    await seedVariant(payload, datasetRoot, savedProduct.id, variant, placeholderId, variantBySku)
  }
}

export function loadSeedCatalogJson(catalogFilePath: string): SeedCatalogFile {
  const raw = JSON.parse(fs.readFileSync(catalogFilePath, 'utf8')) as unknown
  return parseSeedCatalogFile(raw)
}

export async function seedCatalogFromDataset(
  payload: Payload,
  options: SeedCatalogLoaderOptions,
): Promise<Map<string, { id: number; listPrice: number }>> {
  const catalog = loadSeedCatalogJson(options.catalogFilePath)
  const datasetRoot = path.dirname(options.catalogFilePath)
  const placeholderId = await ensurePlaceholderMedia(payload, options)
  const variantBySku = new Map<string, { id: number; listPrice: number }>()

  for (const product of catalog.products) {
    await seedProductFromCatalogEntry(
      payload,
      datasetRoot,
      product,
      placeholderId,
      variantBySku,
    )
  }

  return variantBySku
}

export async function findOrCreatePriceList(
  payload: Payload,
  name: string,
  data: {
    kind: 'standard' | 'company'
    company?: number
    lines: NonNullable<PriceList['lines']>
  },
) {
  const existing = await payload.find({
    collection: 'price-lists',
    where: { name: { equals: name } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'price-lists',
      id: existing.docs[0].id,
      data: { lines: data.lines },
      overrideAccess: true,
    })
    return existing.docs[0]
  }
  return payload.create({
    collection: 'price-lists',
    data: { name, kind: data.kind, company: data.company, lines: data.lines },
    overrideAccess: true,
  })
}

export async function findOrCreateQuote(
  payload: Payload,
  quoteNumber: string,
  data: {
    company: number
    status: Quote['status']
    expiresAt: string
    lines: NonNullable<Quote['lines']>
  },
) {
  const existing = await payload.find({
    collection: 'quotes',
    where: { quoteNumber: { equals: quoteNumber } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'quotes',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return existing.docs[0]
  }
  return payload.create({
    collection: 'quotes',
    data: { quoteNumber, ...data },
    overrideAccess: true,
  })
}

export async function findOrCreateSeedOrder(
  payload: Payload,
  orderNumber: string,
  data: {
    company: number
    status: Order['status']
    shipTo: NonNullable<Order['shipTo']>
    lines: NonNullable<Order['lines']>
  },
) {
  const existing = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'orders',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return existing.docs[0]
  }
  return payload.create({
    collection: 'orders',
    data: { orderNumber, ...data },
    overrideAccess: true,
  })
}
