import type { CollectionBeforeChangeHook, Endpoint } from 'payload'
import type { PayloadRequest } from 'payload'
import { APIError } from 'payload'
import type { User } from '@/payload-types'
import { isStaff } from '@/access'
import type { VendorApprovalStatus } from '@/lib/access/vendor-gate'
import { approveVendorBuyer, rejectVendorBuyer } from '@/lib/admin/vendor-approval-actions'
import { assertAllowedPayloadOrigin, requestUsesCookieAuth } from '@/lib/http/origin-allowlist'

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

async function assertStaffApprovalEndpoint(req: PayloadRequest): Promise<User> {
  const actor = req.user as User | undefined
  if (!actor || !isStaff(actor)) {
    throw new APIError('Forbidden', 403)
  }
  if (requestUsesCookieAuth(req.headers)) {
    try {
      assertAllowedPayloadOrigin(req.headers.get('Origin'))
    } catch {
      throw new APIError('Origin not allowed.', 403)
    }
  }
  return actor
}

export const vendorApprovalEndpoints: Endpoint[] = [
  {
    path: '/:id/approve',
    method: 'post',
    handler: async (req) => {
      try {
        await assertStaffApprovalEndpoint(req)
        const id = Number(req.routeParams?.id)
        if (!Number.isFinite(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
        const doc = await approveVendorBuyer(req, id)
        return Response.json({ doc })
      } catch (err) {
        if (err instanceof APIError) {
          return Response.json({ error: err.message }, { status: err.status })
        }
        throw err
      }
    },
  },
  {
    path: '/:id/reject',
    method: 'post',
    handler: async (req) => {
      try {
        await assertStaffApprovalEndpoint(req)
        const id = Number(req.routeParams?.id)
        if (!Number.isFinite(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })
        const doc = await rejectVendorBuyer(req, id)
        return Response.json({ doc })
      } catch (err) {
        if (err instanceof APIError) {
          return Response.json({ error: err.message }, { status: err.status })
        }
        throw err
      }
    },
  },
]
