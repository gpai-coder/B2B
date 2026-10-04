import type { PayloadRequest } from 'payload'
import { APIError } from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from '@/access'
import type { VendorApprovalStatus } from '@/lib/access/vendor-gate'

export async function setVendorApprovalStatus(
  req: PayloadRequest,
  userId: number,
  status: VendorApprovalStatus,
): Promise<User> {
  const actor = req.user as User | undefined
  if (!actor || !isStaff(actor)) {
    throw new APIError('Forbidden', 403)
  }

  const target = await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })
  if (!target || target.role !== 'vendor-buyer') {
    throw new APIError('User is not a vendor buyer.', 400)
  }

  const updated = await req.payload.update({
    collection: 'users',
    id: userId,
    data: {
      approvalStatus: status,
      approved: status === 'approved',
      approvalReviewedAt: new Date().toISOString(),
      approvalReviewedBy: actor.id,
    },
    req,
    overrideAccess: true,
  })
  return updated as User
}

export async function approveVendorBuyer(req: PayloadRequest, userId: number): Promise<User> {
  return setVendorApprovalStatus(req, userId, 'approved')
}

export async function rejectVendorBuyer(req: PayloadRequest, userId: number): Promise<User> {
  return setVendorApprovalStatus(req, userId, 'rejected')
}
