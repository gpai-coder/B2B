import { redirect } from 'next/navigation'

import { QuoteOrderForm } from '@/components/quotes/QuoteOrderForm'
import { loadQuoteOrderPage } from '@/lib/quotes/load-quote-order-page'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

type Props = { params: Promise<{ quoteNumber: string }> }

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export default async function QuoteOrderPage({ params }: Props) {
  const { quoteNumber } = await params
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect(`/login?next=/quotes/${encodeURIComponent(quoteNumber)}/order`)
  }
  if (!user.approved) {
    return <p className="error">{PENDING_APPROVAL}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const page = await loadQuoteOrderPage(user, companyId, quoteNumber)
  if (!page.ok) {
    return (
      <div className="quote-order" data-testid="quote-order-page">
        <h1>Order from {quoteNumber}</h1>
        <p className="error" data-testid="quote-order-unavailable">
          {page.message}
        </p>
      </div>
    )
  }

  return (
    <div className="quote-order" data-testid="quote-order-page">
      <h1>Order from {page.quoteNumber}</h1>
      <p>Submit a purchase order from this accepted quote (one order per quote).</p>
      <QuoteOrderForm quoteNumber={page.quoteNumber} defaultPo={page.defaultPo} ship={page.ship} />
    </div>
  )
}
