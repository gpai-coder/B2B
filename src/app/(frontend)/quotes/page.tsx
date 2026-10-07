import Link from 'next/link'
import { redirect } from 'next/navigation'

import { loadQuotesListPage } from '@/lib/quotes/load-quotes-list-page'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export default async function QuotesListPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/quotes')
  }
  if (!user.approved) {
    return <p className="error">{PENDING_APPROVAL}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const rows = await loadQuotesListPage(user, companyId)

  return (
    <div className="as-quotes" data-testid="quotes-page">
      <h1 className="as-plp__title">Your quotes</h1>
      {rows.length === 0 ? (
        <p data-testid="quotes-empty">No quotes yet.</p>
      ) : (
        <table className="as-cart-table">
          <thead>
            <tr>
              <th>Quote</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`quote-row-${row.quoteNumber}`}>
                <td>{row.quoteNumber}</td>
                <td data-testid={`quote-status-${row.quoteNumber}`}>{row.status}</td>
                <td>{row.expiresAt}</td>
                <td>
                  {row.orderHref ? (
                    <Link href={row.orderHref} data-testid={`quote-order-link-${row.quoteNumber}`}>
                      Place order
                    </Link>
                  ) : (
                    <span className="as-muted" title={row.unavailable ?? undefined}>
                      Not available
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export const metadata = {
  title: 'Quotes | B2B Portal',
}
