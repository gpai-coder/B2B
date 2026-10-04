import { redirect } from 'next/navigation'

import { getCommerce } from '@/commerce'
import { CartPageClient } from '@/components/cart/CartPageClient'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { vendorPortalApprovalGate, VENDOR_PENDING_ACCOUNT_PATH } from '@/lib/vendor-portal'

export const dynamic = 'force-dynamic'

export default async function CartPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/cart')
  }
  const approval = vendorPortalApprovalGate(user)
  if (!approval.ok) {
    redirect(VENDOR_PENDING_ACCOUNT_PATH)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const commerce = await getCommerce({ user })
  const summary = await commerce.getCartSummary(companyId)

  return <CartPageClient summary={summary} />
}

export const metadata = {
  title: 'Cart | B2B Portal',
}
