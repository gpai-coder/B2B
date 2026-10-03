import type { CollectionConfig } from 'payload'

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
    },
    {
      name: 'specs',
      type: 'group',
      fields: specFields,
    },
    {
      name: 'images',
      type: 'array',
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
      admin: { description: 'Specification sheet PDF.' },
    },
    {
      name: 'installPdf',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Installation guide PDF.' },
    },
  ],
}
