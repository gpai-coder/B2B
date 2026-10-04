import type { User } from '@/payload-types'

export type VendorApprovalStatus = 'pending' | 'approved' | 'rejected'

export function normalizeApprovalStatus(user: User): VendorApprovalStatus {
  const raw = (user as User & { approvalStatus?: string | null }).approvalStatus
  if (raw === 'rejected') return 'rejected'
  if (raw === 'approved') return 'approved'
  if (raw === 'pending') return user.approved ? 'approved' : 'pending'
  if (user.approved) return 'approved'
  return 'pending'
}

export function vendorBuyerIsApproved(user: User): boolean {
  if (user.role !== 'vendor-buyer') return true
  return normalizeApprovalStatus(user) === 'approved' && user.approved === true
}

export function vendorBuyerAccessDeniedMessage(user: User): string {
  const status = normalizeApprovalStatus(user)
  if (status === 'rejected') {
    return 'Your account was not approved. Contact your administrator.'
  }
  return 'Your account is pending administrator approval.'
}
