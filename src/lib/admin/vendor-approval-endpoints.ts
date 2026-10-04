import type { CollectionBeforeChangeHook, Endpoint } from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from '@/access'
import type { VendorApprovalStatus } from '@/lib/access/vendor-gate'
import { approveVendorBuyer, rejectVendorBuyer } from '@/lib/admin/vendor-approval-actions'

export const vendorApprovalBeforeChange: CollectionBeforeChangeHook = async (args) => {
  const user = args.req.user as User | undefined
  const data = { ...(args.data ?? {}) }

  const isVendor =
    data.role === 'vendor-buyer' ||
    (args.originalDoc as User | undefined)?.role === 'vendor-buyer'

  if (isVendor) {
    if (data.approvalStatus === 'rejected') {
      data.approved = false
    } else if (data.approvalStatus === 'approved') {
      data.approved = true
    } else if (data.approved === true) {
      data.approvalStatus = 'approved'
    } else if (data.approved === false) {
      if (data.approvalStatus !== 'rejected') data.approvalStatus = 'pending'
    } else if (data.approvalStatus === 'pending') {
      data.approved = false
    }
  }

  if (!user || !isStaff(user)) return data
  if (data.approvalStatus == null) return data

  const nextStatus = data.approvalStatus as VendorApprovalStatus
  return {
    ...data,
    approved: nextStatus === 'approved',
    approvalReviewedAt: new Date().toISOString(),
    approvalReviewedBy: user.id,
  }
}

export const vendorApprovalEndpoints: Endpoint[] = [
  {
    path: '/:id/approve',
    method: 'post',
    handler: async (req) => {
      const actor = req.user as User | undefined
      if (!actor || !isStaff(actor)) return Response.json({ error: 'Forbidden' }, { status: 403 })
      const id = Number(req.routeParams?.id)
      if (!Number.isFinite(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
      const doc = await approveVendorBuyer(req, id)
      return Response.json({ doc })
    },
  },
  {
    path: '/:id/reject',
    method: 'post',
    handler: async (req) => {
      const actor = req.user as User | undefined
      if (!actor || !isStaff(actor)) return Response.json({ error: 'Forbidden' }, { status: 403 })
      const id = Number(req.routeParams?.id)
      if (!Number.isFinite(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
      const doc = await rejectVendorBuyer(req, id)
      return Response.json({ doc })
    },
  },
]
