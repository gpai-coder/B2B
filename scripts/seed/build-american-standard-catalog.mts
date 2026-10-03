/**
 * Downloads American Standard CDN assets and writes scripts/seed/catalog/products.json.
 * Run: pnpm catalog:build
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import sharp from 'sharp'

import { mapAmericanStandardDocType } from '../../src/collections/product-document-types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_ROOT = path.join(__dirname, 'catalog')
const SOURCE_PATH = path.join(CATALOG_ROOT, 'american-standard.source.json')
const OUT_JSON = path.join(CATALOG_ROOT, 'products.json')
const ASSETS_ROOT = path.join(CATALOG_ROOT, 'assets')

const MAX_EDGE = 1200
const TARGET_BYTES = 150_000

type SourceFile = {
  products: SourceProduct[]
}

type SourceProduct = {
  category: string
  title: string
  collection: string
  modelNumber: string
  handle: string
  breadcrumbs: string[]
  shortBullets: string[]
  features: string[]
  description: string
  specs: Record<string, Record<string, string>>
  documents: Array<{
    type: string
    label: string
    fileType: string
    url: string
    localPath?: string
  }>
  videos?: Array<{ provider: string; id: string }>
  variants: SourceVariant[]
}

type SourceVariant = {
  sku: string
  finish: string
  variantTitle: string
  listPrice: number
  price: number
  upc?: string
  availableOnline?: boolean
  images: Array<{ role: string; url: string; localPath?: string }>
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LIXIL-B2B-Portal-Seed/1.0' },
  })
  if (!res.ok) {
    throw new Error(`Download failed ${res.status} ${url}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

async function writeOptimizedImage(buffer: Buffer, destRelative: string): Promise<string> {
  const destAbs = path.join(CATALOG_ROOT, destRelative)
  fs.mkdirSync(path.dirname(destAbs), { recursive: true })

  let quality = 82
  let last: Buffer | null = null
  const base = sharp(buffer).rotate().resize(MAX_EDGE, MAX_EDGE, {
    fit: 'inside',
    withoutEnlargement: true,
  })

  while (quality >= 48) {
    last = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer()
    if (last.length <= TARGET_BYTES) break
    quality -= 6
  }

  const out = last ?? buffer
  const jpegRel = destRelative.replace(/\.webp$/i, '.jpg')
  const jpegAbs = path.join(CATALOG_ROOT, jpegRel)
  fs.mkdirSync(path.dirname(jpegAbs), { recursive: true })
  fs.writeFileSync(jpegAbs, out)
  return jpegRel
}

function extractFacetMeta(specs: Record<string, Record<string, string>>, category: string) {
  const flat = Object.values(specs).reduce<Record<string, string>>((acc, group) => {
    Object.assign(acc, group)
    return acc
  }, {})

  const meta: Record<string, string> = {}
  if (flat['Fitting Handle Type']) meta.handleType = flat['Fitting Handle Type']
  if (flat['Number of Holes Required']) meta.holesRequired = flat['Number of Holes Required']
  if (flat['ADA Compliant'] || flat['ADA']) meta.ada = flat['ADA Compliant'] ?? flat['ADA']
  if (flat['Bowl Shape'] || flat['Item Shape']) meta.bowlShape = flat['Bowl Shape'] ?? flat['Item Shape']
  if (flat['Flush Technology']) meta.flushTechnology = flat['Flush Technology']
  if (flat['GPF Maximum'] || flat['Flow Rate']) meta.gpf = flat['GPF Maximum'] ?? flat['Flow Rate']

  if (category === 'bathroom-faucet' && !meta.holesRequired) {
    const title = flat['Features'] ?? ''
    if (/single-hole/i.test(title)) meta.holesRequired = '1'
  }

  return Object.keys(meta).length ? meta : undefined
}

function specGroupsFromSource(specs: Record<string, Record<string, string>>) {
  return Object.entries(specs).map(([groupName, rows]) => ({
    groupName,
    rows: Object.entries(rows).map(([label, value]) => ({ label, value: String(value) })),
  }))
}

async function ensurePdf(url: string, destRelative: string): Promise<string> {
  const destAbs = path.join(CATALOG_ROOT, destRelative)
  if (fs.existsSync(destAbs) && fs.statSync(destAbs).size > 500) {
    return destRelative
  }
  fs.mkdirSync(path.dirname(destAbs), { recursive: true })
  const buf = await downloadBuffer(url)
  fs.writeFileSync(destAbs, buf)
  return destRelative
}

async function build() {
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8')) as SourceFile
  const productsOut = []

  for (const product of source.products) {
    const model = product.modelNumber
    const documents: Array<{
      docType: string
      file?: string
      externalUrl?: string
      displayName?: string
    }> = []

    for (const doc of product.documents ?? []) {
      const mapped = mapAmericanStandardDocType(doc.type)
      if (!mapped) continue
      const displayName = doc.label
      if (doc.fileType === 'pdf' && doc.url) {
        const normalized =
          doc.localPath ??
          `assets/${model}/docs/${doc.type}__${path.basename(new URL(doc.url).pathname)}`
        const file = await ensurePdf(doc.url, normalized)
        documents.push({ docType: mapped, file, displayName })
      } else if (doc.url) {
        documents.push({ docType: mapped, externalUrl: doc.url, displayName })
      }
    }

    const variantsOut = []
    for (const variant of product.variants) {
      const imagePaths: string[] = []
      for (const img of variant.images ?? []) {
        const normalized =
          img.localPath ??
          `assets/${model}/images/${variant.sku}/${img.role}_${path.basename(new URL(img.url).pathname)}.jpg`
        if (!fs.existsSync(path.join(CATALOG_ROOT, normalized))) {
          const buf = await downloadBuffer(img.url)
          await writeOptimizedImage(buf, normalized)
        }
        imagePaths.push(normalized)
      }

      variantsOut.push({
        sku: variant.sku,
        finish: variant.finish,
        name: variant.variantTitle,
        listPrice: variant.price,
        msrp: variant.listPrice,
        upc: variant.upc,
        inStock: variant.availableOnline !== false,
        discontinued: variant.availableOnline === false,
        images: imagePaths,
        specs: {},
      })
    }

    const primaryImage = variantsOut[0]?.images[0]

    productsOut.push({
      slug: product.handle,
      name: product.title,
      modelNumber: product.modelNumber,
      productCollection: product.collection || 'American Standard',
      catalogCategory: product.category,
      breadcrumbs: product.breadcrumbs.map((label) => ({ label })),
      description: product.description,
      shortBullets: product.shortBullets.map((text) => ({ text })),
      featureBullets: product.features.map((text) => ({ text })),
      specGroups: specGroupsFromSource(product.specs),
      specsTable: [],
      documents,
      youtubeVideoId: product.videos?.[0]?.id,
      facetMeta: extractFacetMeta(product.specs, product.category),
      primaryImage,
      gallery: [],
      variants: variantsOut,
    })
  }

  const out = {
    version: 1 as const,
    label: 'American Standard (approved LIXIL import)',
    products: productsOut,
  }

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(out, null, 2)}\n`)
  const assetBytes = walkBytes(ASSETS_ROOT)
  console.log(`Wrote ${OUT_JSON} (${productsOut.length} products)`)
  console.log(`Assets under ${ASSETS_ROOT}: ${(assetBytes / 1024 / 1024).toFixed(1)} MiB`)
}

function walkBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    total += entry.isDirectory() ? walkBytes(p) : fs.statSync(p).size
  }
  return total
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
