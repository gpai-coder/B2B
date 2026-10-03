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
  ],
}
