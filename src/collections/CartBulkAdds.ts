import type { CollectionConfig } from 'payload'

import { adminPanelAccess, staffOnly } from '../access'

/** Records idempotent quick-order bulk adds (commerce writes with overrideAccess). */
export const CartBulkAdds: CollectionConfig = {
  slug: 'cart-bulk-adds',
  admin: {
    useAsTitle: 'idempotencyKey',
    defaultColumns: ['idempotencyKey', 'user', 'company', 'createdAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: staffOnly,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  indexes: [{ unique: true, fields: ['user', 'company', 'idempotencyKey'] }],
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      index: true,
    },
    {
      name: 'idempotencyKey',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'addedSkus',
      type: 'json',
      required: true,
    },
  ],
}
