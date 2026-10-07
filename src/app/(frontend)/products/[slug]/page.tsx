import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'

import { ProductDetailView } from '@/components/catalog/ProductDetailView'
import { loadProductDetailPage } from '@/lib/catalog/load-product-detail-page'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { vendorPortalApprovalGate, VENDOR_PENDING_ACCOUNT_PATH } from '@/lib/vendor-portal'

type Props = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

export default async function ProductPage({ params }: Props) {
  const { slug } = await params
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect(`/login?next=/products/${encodeURIComponent(slug)}`)
  }
  const approval = vendorPortalApprovalGate(user)
  if (!approval.ok) {
    redirect(VENDOR_PENDING_ACCOUNT_PATH)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Missing company on user.</p>
  }

  const loaded = await loadProductDetailPage(user, companyId, slug)
  if (!loaded) {
    notFound()
  }

  return (
    <Suspense fallback={<p>Loading product…</p>}>
      <ProductDetailView product={loaded.dto} prices={loaded.prices} />
    </Suspense>
  )
}
