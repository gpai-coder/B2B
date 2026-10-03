import type { CollectionConfig } from 'payload'

import { adminPanelAccess, companyReadAccess, staffOnly } from '../access'

export const Companies: CollectionConfig = {
  slug: 'companies',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'sapCustomerNumber', 'accountApproved', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: companyReadAccess('id'),
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
