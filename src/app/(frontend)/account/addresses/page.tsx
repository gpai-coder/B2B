import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AccountAddressesManager } from '@/components/account/AccountAddressesManager'
import { listVendorShipToAddresses } from '@/lib/vendor/ship-to-addresses'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'

export const dynamic = 'force-dynamic'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export default async function AccountAddressesPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/account/addresses')
  }
  if (!user.approved) {
    return <p className="error">{PENDING_APPROVAL}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const payload = await getPayload({ config: await config })
  const addresses = await listVendorShipToAddresses(payload, user, companyId)

  return (
    <div className="as-account-addresses" data-testid="account-addresses-page">
      <p>
        <Link href="/account">← Back to account</Link>
      </p>
      <h1 className="as-plp__title">Ship-to addresses</h1>
      <AccountAddressesManager initialAddresses={addresses} />
    </div>
  )
}

export const metadata = {
  title: 'Ship-to addresses | B2B Portal',
}
