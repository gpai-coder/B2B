import Link from 'next/link'
import { redirect } from 'next/navigation'

import { loadAccountCompany } from '@/lib/account/load-account-company'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export default async function AccountPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/account')
  }
  if (!user.approved) {
    return <p className="error">{PENDING_APPROVAL}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const company = await loadAccountCompany(user, companyId)

  return (
    <div className="as-account" data-testid="account-page">
      <h1 className="as-plp__title">Your account</h1>
      <section data-testid="account-company">
        <h2>Company</h2>
        <dl>
          <dt>Vendor name</dt>
          <dd data-testid="account-company-name">{company.name}</dd>
          <dt>Account number</dt>
          <dd data-testid="account-company-sap">{company.sapCustomerNumber ?? '—'}</dd>
          <dt>Approval status</dt>
          <dd data-testid="account-company-approved">
            {company.accountApproved ? 'Approved' : 'Pending approval'}
          </dd>
        </dl>
      </section>
      <section data-testid="account-buyer">
        <h2>Buyer</h2>
        <dl>
          <dt>Name</dt>
          <dd data-testid="account-buyer-name">{user.name ?? '—'}</dd>
          <dt>Email</dt>
          <dd data-testid="account-buyer-email">{user.email}</dd>
        </dl>
      </section>
      <nav className="as-account-links" aria-label="Account shortcuts">
        <Link href="/orders" data-testid="account-link-orders">
          Your orders
        </Link>
        <Link href="/quotes" data-testid="account-link-quotes">
          Your quotes
        </Link>
        <Link href="/account/addresses" data-testid="account-link-addresses">
          Ship-to addresses
        </Link>
      </nav>
    </div>
  )
}

export const metadata = {
  title: 'Account | B2B Portal',
}
