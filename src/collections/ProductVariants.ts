import type { CollectionConfig } from 'payload'

import { adminPanelAccess, catalogReadAccess, staffOnly } from '../access'

import { PRODUCT_DOCUMENT_TYPES, PRODUCT_DOCUMENT_LABELS } from './product-document-types'

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
      name: 'documents',
      type: 'array',
      admin: { description: 'Typed downloads (spec, install, parts diagram).' },
      fields: [
        {
          name: 'docType',
          type: 'select',
          required: true,
          options: PRODUCT_DOCUMENT_TYPES.map((value) => ({
            label: PRODUCT_DOCUMENT_LABELS[value],
            value,
          })),
        },
        {
          name: 'file',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'displayName',
          type: 'text',
          admin: { description: 'Optional override for download link text.' },
        },
      ],
    },
    {
      name: 'specPdf',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Legacy — prefer documents[] with type spec-sheet.',
        condition: () => false,
      },
    },
    {
      name: 'installPdf',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Legacy — prefer documents[] with type install-instructions.',
        condition: () => false,
      },
    },
  ],
}
