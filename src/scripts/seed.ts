import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { getPayload } from 'payload'

import config from '../payload.config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const COMMITTED_SEED_DEFAULTS = {
  SEED_ADMIN_PASSWORD: 'local-dev-admin-password',
  SEED_SALES_PASSWORD: 'local-dev-sales-password',
  SEED_VENDOR_A_PASSWORD: 'local-dev-vendor-a-password',
  SEED_VENDOR_B_PASSWORD: 'local-dev-vendor-b-password',
} as const

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

const seedConfig = {
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
  payload: Awaited<ReturnType<typeof getPayload>>,
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

async function main() {
  assertProductionSeedPasswords()
  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: seedConfig.adminEmail } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs.length > 0 && process.env.SEED_FORCE !== '1') {
    console.log('Seed skipped: admin user already exists. Drop the database or set SEED_FORCE=1.')
    process.exit(0)
  }

  const pacific = await payload.create({
    collection: 'companies',
    data: {
      name: 'Pacific Plumbing Supply',
      sapCustomerNumber: 'SAP-100200',
      accountApproved: true,
    },
    overrideAccess: true,
  })

  const bay = await payload.create({
    collection: 'companies',
    data: {
      name: 'Bay Area Fixtures',
      accountApproved: true,
    },
    overrideAccess: true,
  })

  await upsertUser(payload, {
    email: seedConfig.adminEmail,
    password: seedConfig.adminPassword,
    role: 'admin',
    name: 'Portal Admin',
    approved: true,
  })

  await upsertUser(payload, {
    email: seedConfig.salesEmail,
    password: seedConfig.salesPassword,
    role: 'sales',
    name: 'Regional Sales',
    approved: true,
  })

  await upsertUser(payload, {
    email: seedConfig.vendorAEmail,
    password: seedConfig.vendorAPassword,
    role: 'vendor-buyer',
    name: 'Pacific Buyer',
    approved: true,
    company: pacific.id,
  })

  await upsertUser(payload, {
    email: seedConfig.vendorBEmail,
    password: seedConfig.vendorBPassword,
    role: 'vendor-buyer',
    name: 'Bay Buyer (pending)',
    approved: false,
    company: bay.id,
  })

  const pdfPath = path.resolve(__dirname, '../../scripts/fixtures/sample-spec.pdf')
  const pdfBuffer = fs.readFileSync(pdfPath)
  const specMedia = await payload.create({
    collection: 'media',
    data: { alt: 'Sample specification PDF' },
    file: {
      data: pdfBuffer,
      mimetype: 'application/pdf',
      name: 'sample-spec.pdf',
      size: pdfBuffer.length,
    },
    overrideAccess: true,
  })

  const productIds = new Map<string, number>()
  const variantBySku = new Map<string, { id: number; price: number }>()

  for (const row of catalog) {
    let productId = productIds.get(row.slug)
    if (!productId) {
      const product = await payload.create({
        collection: 'products',
        data: {
          name: row.product,
          slug: row.slug,
          productCollection: row.collection,
          description: `${row.product} for commercial and residential pro channels.`,
        },
        overrideAccess: true,
      })
      productId = product.id
      productIds.set(row.slug, productId)
    }

    const variant = await payload.create({
      collection: 'product-variants',
      data: {
        sku: row.sku,
        name: `${row.product} — ${row.finish}`,
        product: productId,
        finish: row.finish,
        specs: {
          flowRateGpm: row.collection === 'Faucets' ? 1.2 : undefined,
          material: row.collection === 'Faucets' ? 'Brass' : 'Vitreous china',
          certifications: 'WaterSense',
        },
        specPdf: row.sku === 'LIX-FCT-1001' ? specMedia.id : undefined,
      },
      overrideAccess: true,
    })
    variantBySku.set(row.sku, { id: variant.id, price: row.price })
  }

  const standardLines = [...variantBySku.entries()].map(([_, v]) => ({
    variant: v.id,
    unitPrice: v.price,
    currency: 'USD',
  }))

  await payload.create({
    collection: 'price-lists',
    data: {
      name: '2026 Standard List',
      kind: 'standard',
      lines: standardLines,
    },
    overrideAccess: true,
  })

  const hero = variantBySku.get('LIX-FCT-1001')
  await payload.create({
    collection: 'price-lists',
    data: {
      name: 'Pacific Plumbing Contract 2026',
      kind: 'company',
      company: pacific.id,
      lines: [
        {
          variant: hero!.id,
          unitPrice: 159,
          currency: 'USD',
          quantityBreaks: [
            { minQuantity: 10, unitPrice: 149 },
            { minQuantity: 25, unitPrice: 139 },
          ],
        },
      ],
    },
    overrideAccess: true,
  })

  const quoteLines = [
    { sku: 'LIX-FCT-1001', variant: hero!.id, quantity: 12, unitPrice: 149 },
    {
      sku: 'LIX-TLT-3000',
      variant: variantBySku.get('LIX-TLT-3000')!.id,
      quantity: 4,
      unitPrice: 499,
    },
  ]

  await payload.create({
    collection: 'quotes',
    data: {
      quoteNumber: 'Q-2026-0001',
      company: pacific.id,
      status: 'sent',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      lines: quoteLines,
    },
    overrideAccess: true,
  })

  console.log('Seed complete.')
  console.log(`Admin: ${seedConfig.adminEmail}`)
  console.log(`Sales: ${seedConfig.salesEmail}`)
  console.log(`Vendor (approved): ${seedConfig.vendorAEmail}`)
  console.log(`Vendor (pending approval): ${seedConfig.vendorBEmail}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
