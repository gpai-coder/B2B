import path from 'path'
import { fileURLToPath } from 'url'

import { getPayload, type Payload } from 'payload'

import config from '../payload.config'
import {
  findOrCreatePriceList,
  findOrCreateQuote,
  findOrCreateSeedOrder,
  seedCatalogFromDataset,
  seedMediaStorageName,
} from './seed-catalog-loader'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

export const COMMITTED_SEED_DEFAULTS = {
  SEED_ADMIN_PASSWORD: 'local-dev-admin-password',
  SEED_SALES_PASSWORD: 'local-dev-sales-password',
  SEED_VENDOR_A_PASSWORD: 'local-dev-vendor-a-password',
  SEED_VENDOR_B_PASSWORD: 'local-dev-vendor-b-password',
} as const

export const SEED_ORDER_NUMBER = 'SEED-ORD-PACIFIC-001'
export const SEED_QUOTE_NUMBER = 'Q-2026-0001'
export const SEED_STANDARD_PRICE_LIST = '2026 Standard List'
export const SEED_PACIFIC_PRICE_LIST = 'Pacific Plumbing Contract 2026'

/** Primary demo contract SKU (Townsend Polished Chrome). */
export const SEED_HERO_SKU = '7353101.002'
export const SEED_HERO_SLUG =
  'townsend-r-single-hole-single-handle-bathroom-faucet-1-2-gpm-4-5-l-min-with-lever-handle'
export const SEED_QUOTE_SECOND_SKU = '2034314.020'

/** Default catalog dataset (override with SEED_CATALOG_PATH). */
export const SEED_CATALOG_DEFAULT_PATH = path.join(repoRoot, 'scripts/seed/catalog/products.json')
export const SEED_PLACEHOLDER_REL = 'assets/product-placeholder.png'
export const SEED_PLACEHOLDER_ALT = 'Product placeholder image'
export const SEED_CATALOG_SPEC_REL =
  'assets/7353101/docs/specSheet__168938_spec_7353101-101P_Townsend_sc_lav_original.pdf'

/** @deprecated Use {@link seedCatalogMediaFilename} for catalog-backed media. */
export const SEED_MEDIA_FILENAME = seedMediaStorageName(SEED_CATALOG_SPEC_REL)
export const SEED_MEDIA_ALT = 'Sample specification PDF'

export function seedCatalogMediaFilename(relativePath: string): string {
  return seedMediaStorageName(relativePath)
}

export function resolveSeedCatalogPath(): string {
  const configured = process.env.SEED_CATALOG_PATH
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(repoRoot, configured)
  }
  return SEED_CATALOG_DEFAULT_PATH
}

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
  data: {
    sapCustomerNumber?: string
    accountApproved: boolean
    defaultShipTo?: {
      name: string
      line1: string
      line2?: string
      city: string
      state: string
      postalCode: string
      country: string
    }
  },
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
  const catalogMediaPrefix = 'seed-catalog__'
  const [companies, users, media, products, variants, priceLists, quotes, orders] =
    await Promise.all([
      payload.count({ collection: 'companies', overrideAccess: true }),
      payload.count({ collection: 'users', overrideAccess: true }),
      payload.count({
        collection: 'media',
        where: { filename: { contains: catalogMediaPrefix } },
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

  const pacificShipTo = {
    name: 'Pacific Plumbing Receiving',
    line1: '100 Market Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
  }

  const pacific = await findOrCreateCompany(p, 'Pacific Plumbing Supply', {
    sapCustomerNumber: 'SAP-100200',
    accountApproved: true,
    defaultShipTo: pacificShipTo,
  })

  const bay = await findOrCreateCompany(p, 'Bay Area Fixtures', {
    accountApproved: true,
    defaultShipTo: {
      name: 'Bay Area Fixtures Receiving',
      line1: '200 Mission Street',
      city: 'Oakland',
      state: 'CA',
      postalCode: '94607',
      country: 'US',
    },
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

  const catalogFilePath = resolveSeedCatalogPath()
  const variantBySku = await seedCatalogFromDataset(p, {
    catalogFilePath,
    placeholderImagePath: path.join(repoRoot, 'scripts/fixtures/product-placeholder.png'),
    placeholderImageAlt: SEED_PLACEHOLDER_ALT,
  })

  const standardLines = [...variantBySku.entries()].map(([_, v]) => ({
    variant: v.id,
    unitPrice: v.listPrice,
    currency: 'USD',
  }))

  await findOrCreatePriceList(p, SEED_STANDARD_PRICE_LIST, {
    kind: 'standard',
    lines: standardLines,
  })

  const hero = variantBySku.get(SEED_HERO_SKU)!
  await findOrCreatePriceList(p, SEED_PACIFIC_PRICE_LIST, {
    kind: 'company',
    company: pacific.id,
    lines: [
      {
        variant: hero.id,
        unitPrice: 199,
        currency: 'USD',
        quantityBreaks: [
          { minQuantity: 10, unitPrice: 189 },
          { minQuantity: 25, unitPrice: 179 },
        ],
      },
    ],
  })

  const quoteSecond = variantBySku.get(SEED_QUOTE_SECOND_SKU)!
  const quoteLines = [
    { sku: SEED_HERO_SKU, variant: hero.id, quantity: 12, unitPrice: 189 },
    {
      sku: SEED_QUOTE_SECOND_SKU,
      variant: quoteSecond.id,
      quantity: 4,
      unitPrice: 499,
    },
  ]

  await findOrCreateQuote(p, SEED_QUOTE_NUMBER, {
    company: pacific.id,
    status: 'accepted',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    lines: quoteLines,
  })
  const seededQuote = await p.find({
    collection: 'quotes',
    where: { quoteNumber: { equals: SEED_QUOTE_NUMBER } },
    limit: 1,
    overrideAccess: true,
  })
  if (seededQuote.docs[0]) {
    await p.update({
      collection: 'quotes',
      id: seededQuote.docs[0].id,
      data: { convertedOrder: null },
      overrideAccess: true,
    })
  }

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
    lines: [{ sku: SEED_HERO_SKU, quantity: 1, unitPrice: 199, variant: hero.id }],
  })

  return p
}

async function main() {
  await runSeed()
  console.log('Seed complete.')
  console.log(`Catalog: ${resolveSeedCatalogPath()}`)
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
