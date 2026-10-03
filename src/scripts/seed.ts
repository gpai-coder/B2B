import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { getPayload, type Payload } from 'payload'

import type { Order, PriceList, Quote } from '../payload-types'
import config from '../payload.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const COMMITTED_SEED_DEFAULTS = {
  SEED_ADMIN_PASSWORD: 'local-dev-admin-password',
  SEED_SALES_PASSWORD: 'local-dev-sales-password',
  SEED_VENDOR_A_PASSWORD: 'local-dev-vendor-a-password',
  SEED_VENDOR_B_PASSWORD: 'local-dev-vendor-b-password',
} as const

export const SEED_ORDER_NUMBER = 'SEED-ORD-PACIFIC-001'
export const SEED_QUOTE_NUMBER = 'Q-2026-0001'
export const SEED_MEDIA_FILENAME = 'sample-spec.pdf'
export const SEED_MEDIA_ALT = 'Sample specification PDF'
export const SEED_STANDARD_PRICE_LIST = '2026 Standard List'
export const SEED_PACIFIC_PRICE_LIST = 'Pacific Plumbing Contract 2026'

function assertProductionSeedPasswords() {
  if (process.env.NODE_ENV !== 'production') return
  for (const [envKey, committedDefault] of Object.entries(COMMITTED_SEED_DEFAULTS)) {
    const value = process.env[envKey]
    if (value === undefined || value === committedDefault) {
      throw new Error(
        `Refusing to run seed in production with default or missing ${envKey}. ` +
          `Set ${envKey} to a strong secret that is not the committed .env.example value.`,
      )
    }
  }
}

export const seedConfig = {
  adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test',
  adminPassword: process.env.SEED_ADMIN_PASSWORD ?? COMMITTED_SEED_DEFAULTS.SEED_ADMIN_PASSWORD,
  salesEmail: process.env.SEED_SALES_EMAIL ?? 'sales@local.test',
  salesPassword: process.env.SEED_SALES_PASSWORD ?? COMMITTED_SEED_DEFAULTS.SEED_SALES_PASSWORD,
  vendorAEmail: process.env.SEED_VENDOR_A_EMAIL ?? 'buyer@pacific-plumbing.local',
  vendorAPassword:
    process.env.SEED_VENDOR_A_PASSWORD ?? COMMITTED_SEED_DEFAULTS.SEED_VENDOR_A_PASSWORD,
  vendorBEmail: process.env.SEED_VENDOR_B_EMAIL ?? 'buyer@bay-fixtures.local',
  vendorBPassword:
    process.env.SEED_VENDOR_B_PASSWORD ?? COMMITTED_SEED_DEFAULTS.SEED_VENDOR_B_PASSWORD,
}

const catalog = [
  { product: 'Lixom Pull-Down Faucet', collection: 'Faucets', slug: 'lixom-pull-down', sku: 'LIX-FCT-1001', finish: 'Chrome', price: 189 },
  { product: 'Lixom Pull-Down Faucet', collection: 'Faucets', slug: 'lixom-pull-down', sku: 'LIX-FCT-1001-BN', finish: 'Brushed Nickel', price: 209 },
  { product: 'Arc Single-Hole Faucet', collection: 'Faucets', slug: 'arc-single-hole', sku: 'LIX-FCT-1100', finish: 'Matte Black', price: 245 },
  { product: 'Wall-Mount Lavatory Faucet', collection: 'Faucets', slug: 'wall-lav-faucet', sku: 'LIX-FCT-1200', finish: 'Polished Chrome', price: 312 },
  { product: 'Commercial Sensor Faucet', collection: 'Faucets', slug: 'sensor-faucet', sku: 'LIX-FCT-2000', finish: 'Stainless', price: 428 },
  { product: 'One-Piece Elongated Toilet', collection: 'Toilets', slug: 'one-piece-toilet', sku: 'LIX-TLT-3000', finish: 'Cotton White', price: 520 },
  { product: 'Two-Piece Round Toilet', collection: 'Toilets', slug: 'two-piece-round', sku: 'LIX-TLT-3100', finish: 'Cotton White', price: 389 },
  { product: 'Wall-Hung Toilet Bowl', collection: 'Toilets', slug: 'wall-hung-bowl', sku: 'LIX-TLT-3200', finish: 'Cotton White', price: 610 },
  { product: 'Undermount Lavatory Sink', collection: 'Fixtures', slug: 'undermount-lav', sku: 'LIX-FIX-4000', finish: 'White', price: 165 },
  { product: 'Vessel Sink', collection: 'Fixtures', slug: 'vessel-sink', sku: 'LIX-FIX-4100', finish: 'Matte White', price: 198 },
]

async function upsertUser(
  payload: Payload,
  data: {
    email: string
    password: string
    role: 'admin' | 'sales' | 'vendor-buyer'
    name: string
    approved?: boolean
    company?: number
  },
) {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: data.email } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: {
        name: data.name,
        role: data.role,
        approved: data.approved,
        company: data.company,
        password: data.password,
      },
      overrideAccess: true,
    })
    return existing.docs[0].id
  }
  const created = await payload.create({
    collection: 'users',
    data: {
      email: data.email,
      password: data.password,
      name: data.name,
      role: data.role,
      approved: data.approved,
      company: data.company,
    },
    overrideAccess: true,
  })
  return created.id
}

async function findOrCreateCompany(
  payload: Payload,
  name: string,
  data: { sapCustomerNumber?: string; accountApproved: boolean },
) {
  const existing = await payload.find({
    collection: 'companies',
    where: { name: { equals: name } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'companies',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return existing.docs[0]
  }
  return payload.create({
    collection: 'companies',
    data: { name, ...data },
    overrideAccess: true,
  })
}

async function findOrCreateMediaByFilename(payload: Payload, filename: string, alt: string) {
  const existing = await payload.find({
    collection: 'media',
    where: {
      or: [{ filename: { equals: filename } }, { alt: { equals: alt } }],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) return existing.docs[0]

  const pdfPath = path.resolve(__dirname, '../../scripts/fixtures/sample-spec.pdf')
  const pdfBuffer = fs.readFileSync(pdfPath)
  return payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data: pdfBuffer,
      mimetype: 'application/pdf',
      name: filename,
      size: pdfBuffer.length,
    },
    overrideAccess: true,
  })
}

async function findOrCreateProduct(
  payload: Payload,
  slug: string,
  data: { name: string; productCollection: string; description: string },
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
    return existing.docs[0]
  }
  return payload.create({
    collection: 'products',
    data: { slug, ...data },
    overrideAccess: true,
  })
}

async function findOrCreateVariant(
  payload: Payload,
  sku: string,
  data: {
    name: string
    product: number
    finish: string
    specs?: Record<string, unknown>
    specPdf?: number
  },
) {
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
    data: { sku, ...data },
    overrideAccess: true,
  })
}

async function findOrCreatePriceList(
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

async function findOrCreateQuote(
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

async function findOrCreateSeedOrder(
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

export type SeedEntityCounts = {
  companies: number
  users: number
  media: number
  products: number
  variants: number
  priceLists: number
  quotes: number
  orders: number
}

export async function countSeedScopeEntities(payload: Payload): Promise<SeedEntityCounts> {
  const [companies, users, media, products, variants, priceLists, quotes, orders] =
    await Promise.all([
      payload.count({ collection: 'companies', overrideAccess: true }),
      payload.count({ collection: 'users', overrideAccess: true }),
      payload.count({
        collection: 'media',
        where: {
          or: [
            { filename: { equals: SEED_MEDIA_FILENAME } },
            { alt: { equals: SEED_MEDIA_ALT } },
          ],
        },
        overrideAccess: true,
      }),
      payload.count({ collection: 'products', overrideAccess: true }),
      payload.count({ collection: 'product-variants', overrideAccess: true }),
      payload.count({ collection: 'price-lists', overrideAccess: true }),
      payload.count({
        collection: 'quotes',
        where: { quoteNumber: { equals: SEED_QUOTE_NUMBER } },
        overrideAccess: true,
      }),
      payload.count({
        collection: 'orders',
        where: { orderNumber: { equals: SEED_ORDER_NUMBER } },
        overrideAccess: true,
      }),
    ])

  return {
    companies: companies.totalDocs,
    users: users.totalDocs,
    media: media.totalDocs,
    products: products.totalDocs,
    variants: variants.totalDocs,
    priceLists: priceLists.totalDocs,
    quotes: quotes.totalDocs,
    orders: orders.totalDocs,
  }
}

export async function runSeed(payload?: Payload) {
  assertProductionSeedPasswords()
  const p = payload ?? (await getPayload({ config }))

  const pacific = await findOrCreateCompany(p, 'Pacific Plumbing Supply', {
    sapCustomerNumber: 'SAP-100200',
    accountApproved: true,
  })

  const bay = await findOrCreateCompany(p, 'Bay Area Fixtures', {
    accountApproved: true,
  })

  await upsertUser(p, {
    email: seedConfig.adminEmail,
    password: seedConfig.adminPassword,
    role: 'admin',
    name: 'Portal Admin',
    approved: true,
  })

  await upsertUser(p, {
    email: seedConfig.salesEmail,
    password: seedConfig.salesPassword,
    role: 'sales',
    name: 'Regional Sales',
    approved: true,
  })

  await upsertUser(p, {
    email: seedConfig.vendorAEmail,
    password: seedConfig.vendorAPassword,
    role: 'vendor-buyer',
    name: 'Pacific Buyer',
    approved: true,
    company: pacific.id,
  })

  await upsertUser(p, {
    email: seedConfig.vendorBEmail,
    password: seedConfig.vendorBPassword,
    role: 'vendor-buyer',
    name: 'Bay Buyer (pending)',
    approved: false,
    company: bay.id,
  })

  const specMedia = await findOrCreateMediaByFilename(p, SEED_MEDIA_FILENAME, SEED_MEDIA_ALT)

  const productIds = new Map<string, number>()
  const variantBySku = new Map<string, { id: number; price: number }>()

  for (const row of catalog) {
    let productId = productIds.get(row.slug)
    if (!productId) {
      const product = await findOrCreateProduct(p, row.slug, {
        name: row.product,
        productCollection: row.collection,
        description: `${row.product} for commercial and residential pro channels.`,
      })
      productId = product.id
      productIds.set(row.slug, productId)
    }

    const variant = await findOrCreateVariant(p, row.sku, {
      name: `${row.product} — ${row.finish}`,
      product: productId,
      finish: row.finish,
      specs: {
        flowRateGpm: row.collection === 'Faucets' ? 1.2 : undefined,
        material: row.collection === 'Faucets' ? 'Brass' : 'Vitreous china',
        certifications: 'WaterSense',
      },
      specPdf: row.sku === 'LIX-FCT-1001' ? specMedia.id : undefined,
    })
    variantBySku.set(row.sku, { id: variant.id, price: row.price })
  }

  const standardLines = [...variantBySku.entries()].map(([_, v]) => ({
    variant: v.id,
    unitPrice: v.price,
    currency: 'USD',
  }))

  await findOrCreatePriceList(p, SEED_STANDARD_PRICE_LIST, {
    kind: 'standard',
    lines: standardLines,
  })

  const hero = variantBySku.get('LIX-FCT-1001')!
  await findOrCreatePriceList(p, SEED_PACIFIC_PRICE_LIST, {
    kind: 'company',
    company: pacific.id,
    lines: [
      {
        variant: hero.id,
        unitPrice: 159,
        currency: 'USD',
        quantityBreaks: [
          { minQuantity: 10, unitPrice: 149 },
          { minQuantity: 25, unitPrice: 139 },
        ],
      },
    ],
  })

  const quoteLines = [
    { sku: 'LIX-FCT-1001', variant: hero.id, quantity: 12, unitPrice: 149 },
    {
      sku: 'LIX-TLT-3000',
      variant: variantBySku.get('LIX-TLT-3000')!.id,
      quantity: 4,
      unitPrice: 499,
    },
  ]

  await findOrCreateQuote(p, SEED_QUOTE_NUMBER, {
    company: pacific.id,
    status: 'sent',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    lines: quoteLines,
  })

  await findOrCreateSeedOrder(p, SEED_ORDER_NUMBER, {
    company: pacific.id,
    status: 'draft',
    shipTo: {
      name: 'Pacific Plumbing Supply',
      line1: '100 Market Street',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    },
    lines: [{ sku: 'LIX-FCT-1001', quantity: 1, unitPrice: 159, variant: hero.id }],
  })

  return p
}

async function main() {
  await runSeed()
  console.log('Seed complete.')
  console.log(`Admin: ${seedConfig.adminEmail}`)
  console.log(`Sales: ${seedConfig.salesEmail}`)
  console.log(`Vendor (approved): ${seedConfig.vendorAEmail}`)
  console.log(`Vendor (pending approval): ${seedConfig.vendorBEmail}`)
  process.exit(0)
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].includes('seed.ts'))

if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
