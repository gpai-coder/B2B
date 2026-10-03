import type { CollectionConfig } from 'payload'

import { adminPanelAccess, catalogReadAccess, staffOnly } from '../access'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'productCollection', 'slug', 'updatedAt'],
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
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'URL-friendly identifier for PDP routes.',
      },
    },
    {
      name: 'productCollection',
      type: 'text',
      required: true,
      admin: {
        description: 'Merchandising collection (e.g. Faucets, Toilets).',
      },
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'featureBullets',
      type: 'array',
      admin: { description: 'Marketing feature bullets (PDP highlights).' },
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    {
      name: 'specsTable',
      type: 'array',
      admin: { description: 'Shared specification rows (label / value).' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
      ],
    },
    {
      name: 'primaryImage',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'PLP thumbnail / default PDP hero when no finish selected.' },
    },
    {
      name: 'gallery',
      type: 'array',
      admin: { description: 'Product-level gallery (lifestyle / alternate angles).' },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
  ],
}
