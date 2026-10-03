import type { CollectionConfig } from 'payload'

import { adminPanelAccess, catalogMediaReadAccess, staffOnly } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    admin: adminPanelAccess,
    read: catalogMediaReadAccess,
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
