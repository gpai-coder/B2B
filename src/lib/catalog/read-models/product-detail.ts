import { getCommerce } from '@/commerce'
import type { ProductDetailDTO } from '@/components/catalog/ProductDetailView'
import { mapDocumentLabel } from '@/lib/catalog/document-labels'
import type { PriceDTO } from '@/lib/catalog/types'
import type { ProductDetailReadModel } from '@/lib/catalog/read-models/types'
import { sanitizeProductDescription } from '@/lib/catalog/sanitize-product-description'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import { resolveMediaId } from '@/lib/product-media'
import type { User } from '@/payload-types'

const PDP_PRODUCT_DEPTH = 2
const PDP_VARIANT_DEPTH = 2

export async function loadProductDetailReadModel(
  user: User,
  companyId: string,
  slug: string,
): Promise<ProductDetailReadModel | null> {
  const payload = await getAppPayload()
  const products = await payload.find({
    collection: 'products',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: PDP_PRODUCT_DEPTH,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
  const product = products.docs[0]
  if (!product) return null

  const variants = await payload.find({
    collection: 'product-variants',
    where: { product: { equals: product.id } },
    sort: 'id',
    limit: 50,
    depth: PDP_VARIANT_DEPTH,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const commerce = await getCommerce({ user })
  const skus = variants.docs.map((v) => v.sku)
  const pricesList = await commerce.getPrices(companyId, skus)
  const prices: Record<string, PriceDTO | undefined> = {}
  for (const row of pricesList) prices[row.sku] = row

  const productDto: ProductDetailDTO = {
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

  return { product: productDto, prices }
}
