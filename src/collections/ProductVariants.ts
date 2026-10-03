import type { CollectionConfig } from 'payload'

import { adminPanelAccess, catalogReadAccess, staffOnly } from '../access'

const specFields = [
  { name: 'flowRateGpm', type: 'number' as const, label: 'Flow rate (GPM)' },
  { name: 'spoutHeightIn', type: 'number' as const, label: 'Spout height (in)' },
  { name: 'material', type: 'text' as const },
  { name: 'certifications', type: 'text' as const, admin: { description: 'e.g. WaterSense, ADA' } },
]

export const ProductVariants: CollectionConfig = {
  slug: 'product-variants',
  admin: {
    useAsTitle: 'sku',
    defaultColumns: ['sku', 'name', 'product', 'finish', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: catalogReadAccess,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'sku',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
    },
    {
      name: 'finish',
      type: 'text',
      required: true,
      admin: { description: 'Finish name shown in the PDP finish selector (e.g. Chrome).' },
    },
    {
      name: 'msrp',
      type: 'number',
      admin: { description: 'List / compare-at price (struck through on PDP).' },
    },
    {
      name: 'upc',
      type: 'text',
    },
    {
      name: 'inStock',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'discontinued',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'moq',
      type: 'number',
      min: 1,
      defaultValue: 1,
      admin: { description: 'Minimum order quantity (MOQ) for this SKU.' },
    },
    {
      name: 'orderMultiple',
      type: 'number',
      min: 1,
      defaultValue: 1,
      admin: { description: 'Order increment / case pack size.' },
    },
    {
      name: 'specs',
      type: 'group',
      fields: specFields,
    },
    {
      name: 'images',
      type: 'array',
      admin: { description: 'Finish-specific images for gallery / selector.' },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
    {
      name: 'specPdf',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Legacy — prefer product documents[].',
        condition: () => false,
      },
    },
    {
      name: 'installPdf',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Legacy — prefer product documents[].',
        condition: () => false,
      },
    },
  ],
}
