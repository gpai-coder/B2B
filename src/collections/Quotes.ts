import type { CollectionConfig } from 'payload'

import {
  adminPanelAccess,
  staffFieldAccess,
  staffFieldAccessUnlessQuoteFrozen,
  staffOnly,
  vendorQuoteReadAccess,
} from '../access'
import {
  quoteStaffAfterError,
  quoteStaffBeforeChange,
  quoteStaffBeforeOperation,
  quoteStaffBeforeValidate,
} from '@/lib/quotes/quote-staff-hooks'

export const Quotes: CollectionConfig = {
  slug: 'quotes',
  admin: {
    useAsTitle: 'quoteNumber',
    defaultColumns: ['quoteNumber', 'company', 'status', 'expiresAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: vendorQuoteReadAccess(),
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  hooks: {
    beforeOperation: [quoteStaffBeforeOperation],
    beforeValidate: [quoteStaffBeforeValidate],
    beforeChange: [quoteStaffBeforeChange],
    afterError: [quoteStaffAfterError],
  },
  fields: [
    {
      name: 'quoteNumber',
      type: 'text',
      required: true,
      unique: true,
      access: { update: staffFieldAccessUnlessQuoteFrozen },
      admin: {
        readOnly: true,
        description: 'Generated on create if empty.',
      },
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      access: { update: staffFieldAccessUnlessQuoteFrozen },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      access: { update: staffFieldAccess },
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Sent', value: 'sent' },
        { label: 'Accepted', value: 'accepted' },
        { label: 'Expired', value: 'expired' },
        { label: 'Withdrawn', value: 'withdrawn' },
        { label: 'Cancelled (legacy)', value: 'cancelled' },
      ],
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      access: { update: staffFieldAccessUnlessQuoteFrozen },
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'notes',
      type: 'textarea',
      access: { update: staffFieldAccess },
      admin: { description: 'Internal or customer-facing notes (editable after send).' },
    },
    {
      name: 'convertedOrder',
      type: 'relationship',
      relationTo: 'orders',
      admin: { readOnly: true },
    },
    {
      name: 'lines',
      type: 'array',
      required: true,
      access: { update: staffFieldAccessUnlessQuoteFrozen },
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
          min: 0,
        },
      ],
    },
  ],
}
