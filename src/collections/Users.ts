import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role', 'company', 'approved'],
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'vendor-buyer',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Sales', value: 'sales' },
        { label: 'Vendor buyer', value: 'vendor-buyer' },
      ],
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      admin: {
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
      },
    },
    {
      name: 'approved',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Vendor buyers must be approved before they can sign in.',
        condition: (_, siblingData) => siblingData?.role === 'vendor-buyer',
      },
    },
  ],
}
