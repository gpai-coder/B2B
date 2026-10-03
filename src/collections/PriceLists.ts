import type { CollectionConfig } from 'payload'

import { adminPanelAccess, priceListReadAccess, staffOnly } from '../access'

export const PriceLists: CollectionConfig = {
  slug: 'price-lists',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'company', 'validFrom', 'validTo'],
  },
  access: {
    admin: adminPanelAccess,
    read: priceListReadAccess,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [
        { label: 'Standard list price', value: 'standard' },
        { label: 'Company-specific', value: 'company' },
      ],
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      admin: {
        condition: (_, siblingData) => siblingData?.kind === 'company',
      },
    },
    {
      name: 'validFrom',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'validTo',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'lines',
      type: 'array',
      required: true,
      fields: [
        {
          name: 'variant',
          type: 'relationship',
          relationTo: 'product-variants',
          required: true,
        },
        {
          name: 'unitPrice',
          type: 'number',
          required: true,
          min: 0,
        },
        {
          name: 'currency',
          type: 'text',
          defaultValue: 'USD',
        },
        {
          name: 'quantityBreaks',
          type: 'array',
          fields: [
            {
              name: 'minQuantity',
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
    },
  ],
}
