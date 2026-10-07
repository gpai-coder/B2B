import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { CatalogPageClient } from '@/components/catalog/CatalogPageClient'
import { loadCatalogPageData } from '@/lib/catalog/load-catalog-page-data'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { vendorPortalApprovalGate, VENDOR_PENDING_ACCOUNT_PATH } from '@/lib/vendor-portal'

export const dynamic = 'force-dynamic'

export default async function CatalogPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/catalog')
  }
  const approval = vendorPortalApprovalGate(user)
  if (!approval.ok) {
    redirect(VENDOR_PENDING_ACCOUNT_PATH)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const { catalogProducts, prices } = await loadCatalogPageData(user, companyId)

  return (
    <Suspense fallback={<p>Loading catalog…</p>}>
      <CatalogPageClient products={catalogProducts} prices={prices} />
    </Suspense>
  )
}

export const metadata = {
  title: 'Catalog | B2B Portal',
}
