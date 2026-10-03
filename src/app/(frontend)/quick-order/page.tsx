import { redirect } from 'next/navigation'

import { QuickOrderClient } from '@/components/quick-order/QuickOrderClient'
import { getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function QuickOrderPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/quick-order')
  }
  if (!user.approved) {
    return <p className="error">Your account is pending administrator approval.</p>
  }

  return <QuickOrderClient />
}

export const metadata = {
  title: 'Quick order | B2B Portal',
}
