import type { CollectionConfig } from 'payload'

import {
  adminPanelAccess,
  companyReadAccess,
  getUserCompanyId,
  isStaff,
  staffOnly,
} from '../access'

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'company', 'status', 'poNumber', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: companyReadAccess(),
    create: ({ req: { user } }) => {
      if (!user) return false
      if (isStaff(user)) return true
      return user.role === 'vendor-buyer' && Boolean(getUserCompanyId(user))
    },
    update: companyReadAccess(),
    delete: staffOnly,
  },
  hooks: {
    beforeChange: [
      ({ req, data }) => {
        const user = req.user
        if (!user || isStaff(user)) return data
        if (user.role === 'vendor-buyer') {
          const companyId = getUserCompanyId(user)
          if (companyId) {
            return { ...data, company: companyId }
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'orderNumber',
      type: 'text',
      unique: true,
      admin: {
        readOnly: true,
        description: 'Generated on submit if empty.',
      },
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Submitted', value: 'submitted' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Shipped', value: 'shipped' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      name: 'poNumber',
      type: 'text',
    },
    {
      name: 'quote',
      type: 'relationship',
      relationTo: 'quotes',
    },
    {
      name: 'idempotencyKey',
      type: 'text',
      unique: true,
      admin: {
        description: 'Client-supplied key to dedupe submit requests.',
      },
    },
    {
      name: 'shipTo',
      type: 'group',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'line1', type: 'text', required: true },
        { name: 'line2', type: 'text' },
        { name: 'city', type: 'text', required: true },
        { name: 'state', type: 'text', required: true },
        { name: 'postalCode', type: 'text', required: true },
        { name: 'country', type: 'text', required: true, defaultValue: 'US' },
      ],
    },
    {
      name: 'lines',
      type: 'array',
      required: true,
      fields: [
        {
          name: 'sku',
          type: 'text',
          required: true,
        },
        {
          name: 'variant',
          type: 'relationship',
          relationTo: 'product-variants',
        },
        {
          name: 'quantity',
          type: 'number',
          required: true,
          min: 1,
        },
        {
          name: 'unitPrice',
          type: 'number',
          required: true,
          min: 0,
        },
      ],
    },
  ],
}
