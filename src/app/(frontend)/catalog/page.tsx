import { readFileSync } from 'fs'
import { join } from 'path'

import { getCommerce } from '@/commerce'
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

  const commerce = await getCommerce({ user })
  const skus = ['LIX-FCT-1001', 'LIX-FCT-1001-BN', 'LIX-TLT-3000']
  const prices = await commerce.getPrices(companyId, skus)

  return (
    <div className="catalog">
      <h1>Catalog pricing</h1>
      <p>Signed in as {user.email}. Prices below include your company contract where applicable.</p>
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
