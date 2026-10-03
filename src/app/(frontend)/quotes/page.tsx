import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCommerce } from '@/commerce'
import { QUOTE_NOT_AVAILABLE_MESSAGE, quoteOrderAvailability } from '@/lib/quotes/quote-order-eligibility'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'

export const dynamic = 'force-dynamic'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

function formatExpiry(expiresAt?: string | null) {
  if (!expiresAt) return '—'
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

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

  const commerce = await getCommerce({ user })
  const quotes = await commerce.listQuotes(companyId)
  const payload = await getPayload({ config: await config })
  const req = createPayloadReq(payload, user)

  const rows = await Promise.all(
    quotes.map(async (q) => {
      const full = await payload.findByID({
        collection: 'quotes',
        id: Number(q.id),
        overrideAccess: false,
        req,
      })
      const canOrder = quoteOrderAvailability(full, companyId).ok
      return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: full.status ?? '—',
        expiresAt: formatExpiry(full.expiresAt),
        orderHref: canOrder ? `/quotes/${encodeURIComponent(q.quoteNumber)}/order` : null,
        unavailable: canOrder ? null : QUOTE_NOT_AVAILABLE_MESSAGE,
      }
    }),
  )

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
