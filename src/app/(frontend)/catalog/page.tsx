import Link from 'next/link'

import { getPayload } from 'payload'

import config from '@/payload.config'
import { getCommerce } from '@/commerce'
import { createPayloadReq } from '@/lib/payload-req'
import { mediaAlt, resolveMediaId, vendorMediaPath } from '@/lib/product-media'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function CatalogPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/catalog')
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const products = await payload.find({
    collection: 'products',
    limit: 50,
    depth: 2,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  const commerce = await getCommerce({ user })
  const heroSkus = ['LIX-FCT-1001', 'LIX-FCT-1001-BN', 'LIX-TLT-3000']
  const prices = await commerce.getPrices(companyId, heroSkus)
  const priceBySku = new Map(prices.map((p) => [p.sku, p]))

  return (
    <div className="catalog">
      <h1>Catalog</h1>
      <p>Signed in as {user.email}. Prices below include your company contract where applicable.</p>

      <ul className="catalog-grid">
        {products.docs.map((product) => {
          const imageId = resolveMediaId(product.primaryImage)
          return (
            <li key={product.id} className="catalog-card" data-slug={product.slug}>
              <Link href={`/products/${product.slug}`} className="catalog-card-link">
                {imageId ? (
                  <img
                    src={vendorMediaPath(imageId)}
                    alt={mediaAlt(product.primaryImage, product.name)}
                    className="catalog-thumb"
                    data-testid={`catalog-thumb-${product.slug}`}
                  />
                ) : (
                  <img
                    src="/images/product-fallback.svg"
                    alt=""
                    className="catalog-thumb catalog-thumb--fallback"
                    data-testid={`catalog-thumb-fallback-${product.slug}`}
                  />
                )}
                <span className="catalog-card-title">{product.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <h2>Sample contract pricing</h2>
      <table className="price-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Your price</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.sku} data-sku={p.sku}>
              <td>{p.sku}</td>
              <td data-testid={`price-${p.sku}`}>
                ${p.unitPrice.amount.toFixed(2)} {p.unitPrice.currency}
              </td>
              <td>{p.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a href="/quotes/Q-2026-0001/order">Create order from quote Q-2026-0001</a>
      </p>
    </div>
  )
}

export const metadata = {
  title: 'Catalog | B2B Portal',
}
