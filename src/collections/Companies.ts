import type { CollectionConfig } from 'payload'

export const Companies: CollectionConfig = {
  slug: 'companies',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'sapCustomerNumber', 'updatedAt'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'sapCustomerNumber',
      type: 'text',
      admin: {
        description: 'Optional SAP S/4 customer number for a future MuleSoft integration.',
      },
    },
    {
      name: 'accountApproved',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'When false, vendor users for this company cannot sign in.',
      },
    },
  ],
}
