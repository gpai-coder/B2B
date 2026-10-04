import { Suspense } from 'react'

import { getPayload } from 'payload'

import config from '@/payload.config'
import { getCommerce } from '@/commerce'
import { CatalogPageClient } from '@/components/catalog/CatalogPageClient'
import { mapProductToDTO } from '@/lib/catalog/map-payload'
import type { PriceDTO } from '@/lib/catalog/types'
import { createPayloadReq } from '@/lib/payload-req'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { vendorPortalApprovalGate, VENDOR_PENDING_ACCOUNT_PATH } from '@/lib/vendor-portal'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CatalogPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/catalog')
  }
  const approval = vendorPortalApprovalGate(user)
  if (!approval.ok) {
    redirect(VENDOR_PENDING_ACCOUNT_PATH)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const productsResult = await payload.find({
    collection: 'products',
    limit: 100,
    depth: 1,
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
    depth: 1,
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

  const catalogProducts = productsResult.docs.map((product) =>
    mapProductToDTO(product, variantsByProduct.get(product.id) ?? []),
  )

  const allSkus = variantsResult.docs.map((v) => v.sku)
  const commerce = await getCommerce({ user })
  const priceRows = await commerce.getPrices(companyId, allSkus)
  const prices: Record<string, PriceDTO> = {}
  for (const row of priceRows) {
    prices[row.sku] = row as PriceDTO
  }

  return (
    <Suspense fallback={<p>Loading catalog…</p>}>
      <CatalogPageClient products={catalogProducts} prices={prices} />
    </Suspense>
  )
}

export const metadata = {
  title: 'Catalog | B2B Portal',
}
