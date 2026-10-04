import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import {
  adminPanelAccess,
  assertVendorCanLogin,
  staffFieldAccess,
  staffOnly,
  staffOrSelfUser,
} from '../access'
import { vendorApprovalBeforeChange, vendorApprovalEndpoints } from '@/lib/admin/vendor-approval-endpoints'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role', 'company', 'approvalStatus', 'approved'],
    listSearchableFields: ['email', 'approvalStatus'],
    description:
      'Filter approvalStatus = pending for the vendor approval queue. Use Approve/Reject endpoints or edit approval status.',
  },
  auth: true,
  endpoints: vendorApprovalEndpoints,
  access: {
    admin: adminPanelAccess,
    create: staffOnly,
    read: staffOrSelfUser,
    update: staffOrSelfUser,
    delete: staffOnly,
  },
  hooks: {
    beforeLogin: [
      async ({ user, req }) => {
        try {
          await assertVendorCanLogin(req, user)
        } catch (err) {
          throw new APIError(err instanceof Error ? err.message : 'Login not allowed', 403)
        }
        return user
      },
    ],
    beforeChange: [vendorApprovalBeforeChange],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'vendor-buyer',
      access: {
        update: staffFieldAccess,
      },
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Sales', value: 'sales' },
        { label: 'Vendor buyer', value: 'vendor-buyer' },
      ],
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      access: {
        update: staffFieldAccess,
      },
      admin: {
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
      },
    },
    {
      name: 'approvalStatus',
      type: 'select',
      defaultValue: 'pending',
      access: {
        update: staffFieldAccess,
      },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: {
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
      },
    },
    {
      name: 'approved',
      type: 'checkbox',
      defaultValue: false,
      access: {
        update: staffFieldAccess,
      },
      admin: {
        description: 'Synced from approval status. Vendor buyers must be approved to use the portal.',
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
        readOnly: true,
      },
    },
    {
      name: 'approvalReviewedAt',
      type: 'date',
      access: { update: () => false, create: () => false },
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
      },
    },
    {
      name: 'approvalReviewedBy',
      type: 'relationship',
      relationTo: 'users',
      access: { update: () => false, create: () => false },
      admin: {
        readOnly: true,
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
      },
    },
  ],
}
