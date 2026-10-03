import { getPayload } from 'payload'

import config from '@/payload.config'
import { getCommerce } from '@/commerce'

import { createPayloadReq } from '@/lib/payload-req'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { redirect } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

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

  return (
    <div className="product-page" data-testid="product-page">
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <ul>
        {variants.docs.map((variant) => {
          const price = priceBySku.get(variant.sku)
          return (
            <li key={variant.id} data-sku={variant.sku}>
              <strong>{variant.sku}</strong> — {variant.name}
              {variant.specPdf != null ? (
                <span data-testid={`has-spec-pdf-${variant.sku}`}> (spec PDF attached)</span>
              ) : null}
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
