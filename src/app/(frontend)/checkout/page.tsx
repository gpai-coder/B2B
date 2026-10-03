import { redirect } from 'next/navigation'

import { getCommerce } from '@/commerce'
import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/checkout')
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const commerce = await getCommerce({ user })
  const summary = await commerce.getCartSummary(companyId)
  if (summary.lines.length === 0) {
    redirect('/cart')
  }

  const payload = await getPayload({ config: await config })
  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })

  return <CheckoutForm summary={summary} defaultShipTo={shipToFromCompanyDefault(company.defaultShipTo)} />
}

export const metadata = {
  title: 'Checkout | B2B Portal',
}
