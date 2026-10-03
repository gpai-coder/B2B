import type { CollectionConfig } from 'payload'

import { adminPanelAccess, catalogReadAccess, staffOnly } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    admin: adminPanelAccess,
    read: catalogReadAccess,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: ['image/*', 'application/pdf'],
  },
}
