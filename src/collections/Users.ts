import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import {
  adminPanelAccess,
  assertVendorCanLogin,
  companyReadAccess,
  staffFieldAccess,
  staffOnly,
  staffOrSelfUser,
} from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role', 'company', 'approved'],
  },
  auth: true,
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
      name: 'approved',
      type: 'checkbox',
      defaultValue: false,
      access: {
        update: staffFieldAccess,
      },
      admin: {
        description: 'Vendor buyers must be approved before they can sign in.',
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
      },
    },
  ],
}
