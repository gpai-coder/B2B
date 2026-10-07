import { redirect } from 'next/navigation'

import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { loadCheckoutPageData } from '@/lib/checkout/load-checkout-page'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export default async function CheckoutPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/checkout')
  }
  if (!user.approved) {
    return <p className="error">{PENDING_APPROVAL}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const { summary, defaultShipTo, savedAddresses } = await loadCheckoutPageData(user, companyId)
  if (summary.lines.length === 0) {
    redirect('/cart')
  }

  return (
    <CheckoutForm summary={summary} defaultShipTo={defaultShipTo} savedAddresses={savedAddresses} />
  )
}

export const metadata = {
  title: 'Checkout | B2B Portal',
}
