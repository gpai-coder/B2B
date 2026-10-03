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
    // Gated catalog media: never let the CDN cache /api/media/file/* publicly (the Blob
    // adapter defaults to `public, max-age=31536000`, which lets one vendor fetch seed the
    // edge cache for anonymous users).
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, no-store')
      return headers
    },
  },
}
