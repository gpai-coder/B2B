import type { CollectionConfig } from 'payload'

export const Quotes: CollectionConfig = {
  slug: 'quotes',
  admin: {
    useAsTitle: 'quoteNumber',
    defaultColumns: ['quoteNumber', 'company', 'status', 'expiresAt'],
  },
  fields: [
    {
      name: 'quoteNumber',
      type: 'text',
      required: true,
      unique: true,
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
        { label: 'Sent', value: 'sent' },
        { label: 'Accepted', value: 'accepted' },
        { label: 'Expired', value: 'expired' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayOnly' } },
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
