import type { CollectionConfig, Endpoint } from 'payload'
import { APIError } from 'payload'

import { adminPanelAccess, companyReadAccess } from '../access'
import { assertOrderEventCreateIsTrusted } from '@/lib/orders/order-events'

export const OrderEvents: CollectionConfig = {
  slug: 'order-events',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['order', 'fromStatus', 'toStatus', 'actor', 'createdAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: companyReadAccess('company'),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      ({ req, operation, data }) => {
        if (operation === 'create') assertOrderEventCreateIsTrusted(req)
        return data
      },
    ],
  },
  fields: [
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
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
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'status_change',
      options: [{ label: 'Status change', value: 'status_change' }],
    },
    {
      name: 'fromStatus',
      type: 'text',
      required: true,
    },
    {
      name: 'toStatus',
      type: 'text',
      required: true,
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
    },
    {
      name: 'note',
      type: 'textarea',
    },
  ],
}
