import type { User } from '@/payload-types'
import { vendorBuyerAccessDeniedMessage, vendorBuyerIsApproved } from '@/lib/access/vendor-gate'

export function vendorPortalApprovalGate(user: User): { ok: true } | { ok: false; message: string } {
  if (user.role !== 'vendor-buyer') return { ok: false, message: 'Authentication required.' }
  if (!vendorBuyerIsApproved(user)) {
    return { ok: false, message: vendorBuyerAccessDeniedMessage(user) }
  }
  return { ok: true }
}

/** Server components: send unapproved buyers to account (pending / rejected messaging). */
export const VENDOR_PENDING_ACCOUNT_PATH = '/account'
