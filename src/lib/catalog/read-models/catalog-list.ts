import { getCommerce } from '@/commerce'
import { mapProductToDTO } from '@/lib/catalog/map-payload'
import type { CatalogListReadModel } from '@/lib/catalog/read-models/types'
import { createPayloadReq } from '@/lib/payload-req'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import type { User } from '@/payload-types'

const PLP_PRODUCT_DEPTH = 1
const PLP_VARIANT_DEPTH = 1

/** Catalog PLP read model — depth is owned here, not in pages. */
export async function loadCatalogListReadModel(
  user: User,
  companyId: string,
): Promise<CatalogListReadModel> {
  const payload = await getAppPayload()
  const productsResult = await payload.find({
    collection: 'products',
    limit: 100,
    depth: PLP_PRODUCT_DEPTH,
    where: {
      catalogHidden: { equals: false },
    },
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const variantsResult = await payload.find({
    collection: 'product-variants',
    sort: 'id',
    limit: 500,
    depth: PLP_VARIANT_DEPTH,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const variantsByProduct = new Map<number, typeof variantsResult.docs>()
  for (const variant of variantsResult.docs) {
    const productId = typeof variant.product === 'object' ? variant.product.id : variant.product
    const list = variantsByProduct.get(productId) ?? []
    list.push(variant)
    variantsByProduct.set(productId, list)
  }

  const products = productsResult.docs.map((product) =>
    mapProductToDTO(product, variantsByProduct.get(product.id) ?? []),
  )

  const allSkus = variantsResult.docs.map((v) => v.sku)
  const commerce = await getCommerce({ user })
  const priceRows = await commerce.getPrices(companyId, allSkus)
  const prices: CatalogListReadModel['prices'] = {}
  for (const row of priceRows) {
    prices[row.sku] = row
  }

  return { products, prices }
}
