import type { Access, CollectionConfig, Where } from 'payload'

import { adminPanelAccess, getUserCompanyId, isStaff, staffOnly } from '../access'
import type { User } from '../payload-types'

const vendorCartAccess: Access = ({ req: { user } }) => {
  const u = user as User | null
  if (!u) return false
  if (isStaff(u)) return true
  if (u.role !== 'vendor-buyer') return false
  const companyId = getUserCompanyId(u)
  if (!companyId) return false
  const where: Where = {
    and: [{ user: { equals: u.id } }, { company: { equals: companyId } }],
  }
  return where
}

export const Carts: CollectionConfig = {
  slug: 'carts',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['user', 'company', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: vendorCartAccess,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
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
      name: 'lines',
      type: 'array',
      fields: [
        {
          name: 'sku',
          type: 'text',
          required: true,
        },
        {
          name: 'variant',
          type: 'relationship',
          relationTo: 'product-variants',
        },
        {
          name: 'quantity',
          type: 'number',
          required: true,
          min: 1,
        },
      ],
    },
  ],
}
