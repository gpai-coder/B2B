import { Suspense } from 'react'

import { getPayload } from 'payload'

import config from '@/payload.config'
import { getCommerce } from '@/commerce'
import { ProductDetailView, type ProductDetailDTO } from '@/components/catalog/ProductDetailView'
import { sanitizeProductDescription } from '@/lib/catalog/sanitize-product-description'
import { mapDocumentLabel } from '@/lib/catalog/document-labels'
import { createPayloadReq } from '@/lib/payload-req'
import { resolveMediaId } from '@/lib/product-media'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { vendorPortalApprovalGate, VENDOR_PENDING_ACCOUNT_PATH } from '@/lib/vendor-portal'
import { redirect } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect(`/login?next=/products/${encodeURIComponent(slug)}`)
  }
  const approval = vendorPortalApprovalGate(user)
  if (!approval.ok) {
    redirect(VENDOR_PENDING_ACCOUNT_PATH)
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
    sort: 'id',
    limit: 50,
    depth: 2,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const commerce = await getCommerce({ user })
  const skus = variants.docs.map((v) => v.sku)
  const pricesList = await commerce.getPrices(companyId, skus)
  const prices: Record<string, (typeof pricesList)[number]> = {}
  for (const row of pricesList) prices[row.sku] = row

  const dto: ProductDetailDTO = {
    slug: product.slug,
    name: product.name,
    modelNumber: product.modelNumber,
    productCollection: product.productCollection,
    description: sanitizeProductDescription(product.description),
    shortBullets: (product.shortBullets ?? []).map((b) => b.text),
    featureBullets: (product.featureBullets ?? []).map((b) => b.text),
    specGroups: (product.specGroups ?? []).map((g) => ({
      groupName: g.groupName,
      rows: (g.rows ?? []).map((r) => ({ label: r.label, value: r.value })),
    })),
    youtubeVideoId: product.youtubeVideoId,
    documents: (product.documents ?? []).map((d) => ({
      docType: d.docType,
      label: mapDocumentLabel(d.docType, d.displayName),
      mediaId: resolveMediaId(d.file) ?? undefined,
      externalUrl: d.externalUrl ?? undefined,
    })),
    variants: variants.docs.map((v) => ({
      sku: v.sku,
      finish: v.finish ?? '',
      upc: v.upc,
      msrp: v.msrp,
      inStock: v.inStock !== false,
      discontinued: v.discontinued === true,
      moq: v.moq ?? 1,
      orderMultiple: v.orderMultiple ?? 1,
      imageMediaIds: (v.images ?? [])
        .map((row) => resolveMediaId(row.image))
        .filter((id): id is number => id != null),
    })),
  }

  return (
    <Suspense fallback={<p>Loading product…</p>}>
      <ProductDetailView product={dto} prices={prices} />
    </Suspense>
  )
}
