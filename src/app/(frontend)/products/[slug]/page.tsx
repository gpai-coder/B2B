import Image from 'next/image'
import Link from 'next/link'

import { getPayload } from 'payload'

import config from '@/payload.config'
import { getCommerce } from '@/commerce'
import { createPayloadReq } from '@/lib/payload-req'
import { PRODUCT_DOCUMENT_LABELS } from '@/collections/product-document-types'
import { mediaAlt, resolveMediaId, vendorMediaPath } from '@/lib/product-media'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { redirect } from 'next/navigation'

import type { Media, Product, ProductVariant } from '@/payload-types'

type Props = { params: Promise<{ slug: string }> }

function collectProductImages(
  product: Product,
  variants: ProductVariant[],
): { id: number; alt: string }[] {
  const images: { id: number; alt: string }[] = []
  const seen = new Set<number>()

  const push = (value: number | Media | null | undefined, alt: string) => {
    const id = resolveMediaId(value)
    if (id == null || seen.has(id)) return
    seen.add(id)
    images.push({ id, alt: mediaAlt(value, alt) })
  }

  push(product.primaryImage, product.name)
  for (const row of product.gallery ?? []) {
    push(row.image, product.name)
  }
  if (images.length === 0) {
    for (const variant of variants) {
      for (const row of variant.images ?? []) {
        push(row.image, variant.name)
      }
    }
  }
  return images
}

type VariantDocument = {
  sku: string
  label: string
  mediaId: number
  filename: string
}

function collectVariantDocuments(variants: ProductVariant[]): VariantDocument[] {
  const docs: VariantDocument[] = []
  for (const variant of variants) {
    for (const row of variant.documents ?? []) {
      const id = resolveMediaId(row.file)
      if (!id) continue
      const file = row.file
      const filename = typeof file === 'object' ? file.filename ?? 'document.pdf' : 'document.pdf'
      const label =
        row.displayName ??
        (row.docType ? PRODUCT_DOCUMENT_LABELS[row.docType] : 'Document')
      docs.push({ sku: variant.sku, label, mediaId: id, filename })
    }
    if (variant.specPdf) {
      const id = resolveMediaId(variant.specPdf)
      const filename =
        typeof variant.specPdf === 'object' ? variant.specPdf.filename ?? 'spec.pdf' : 'spec.pdf'
      if (id) docs.push({ sku: variant.sku, label: 'Specification sheet', mediaId: id, filename })
    }
    if (variant.installPdf) {
      const id = resolveMediaId(variant.installPdf)
      const filename =
        typeof variant.installPdf === 'object'
          ? variant.installPdf.filename ?? 'install.pdf'
          : 'install.pdf'
      if (id)
        docs.push({ sku: variant.sku, label: 'Installation guide', mediaId: id, filename })
    }
  }
  return docs
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect(`/login?next=/products/${encodeURIComponent(slug)}`)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Missing company on user.</p>
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const products = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
  const product = products.docs[0]
  if (!product) {
    return <p className="error">Product not found.</p>
  }

  const variants = await payload.find({
    collection: 'product-variants',
    where: { product: { equals: product.id } },
    limit: 20,
    depth: 2,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const commerce = await getCommerce({ user })
  const skus = variants.docs.map((v) => v.sku)
  const prices = await commerce.getPrices(companyId, skus)
  const priceBySku = new Map(prices.map((p) => [p.sku, p]))

  const images = collectProductImages(product, variants.docs)
  const documents = collectVariantDocuments(variants.docs)

  return (
    <div className="product-page" data-testid="product-page">
      <h1>{product.name}</h1>
      <p>{product.description}</p>

      <section className="product-media" aria-label="Product images">
        {images.length > 0 ? (
          <ul className="product-gallery">
            {images.map((img, index) => (
              <li key={img.id}>
                {/* Cookie-authenticated proxy; next/image cannot attach session cookies reliably */}
                <img
                  src={vendorMediaPath(img.id)}
                  alt={img.alt}
                  data-testid={index === 0 ? 'product-primary-image' : `product-gallery-image-${img.id}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Image
            src="/images/product-fallback.svg"
            alt="No product image"
            width={320}
            height={240}
            data-testid="product-image-fallback"
          />
        )}
      </section>

      {documents.length > 0 ? (
        <section className="product-documents" aria-label="Documents">
          <h2>Documents</h2>
          <ul>
            {documents.map((doc) => (
              <li key={`${doc.sku}-${doc.mediaId}-${doc.label}`}>
                <a
                  href={vendorMediaPath(doc.mediaId, { download: true })}
                  data-testid={`product-doc-${doc.sku}-${doc.label.includes('Specification') ? 'spec' : 'install'}`}
                >
                  {doc.label} ({doc.sku}) — {doc.filename}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul>
        {variants.docs.map((variant) => {
          const price = priceBySku.get(variant.sku)
          return (
            <li key={variant.id} data-sku={variant.sku}>
              <strong>{variant.sku}</strong> — {variant.name}
              {price ? (
                <div data-testid={`product-price-${variant.sku}`}>
                  Your price: ${price.unitPrice.amount.toFixed(2)} ({price.source})
                </div>
              ) : (
                <div>No price available</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
