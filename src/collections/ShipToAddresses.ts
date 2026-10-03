import type { CollectionConfig } from 'payload'

import {
  adminPanelAccess,
  approvedVendorCompanyWriteAccess,
  companyReadAccess,
  staffOnly,
} from '../access'

export const ShipToAddresses: CollectionConfig = {
  slug: 'ship-to-addresses',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'company', 'isDefault', 'city', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: companyReadAccess('company'),
    create: approvedVendorCompanyWriteAccess('company'),
    update: approvedVendorCompanyWriteAccess('company'),
    delete: approvedVendorCompanyWriteAccess('company'),
  },
  fields: [
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      index: true,
    },
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: { description: 'Short name shown in checkout (e.g. Main warehouse).' },
    },
    { name: 'name', type: 'text', required: true },
    { name: 'line1', type: 'text', required: true },
    { name: 'line2', type: 'text' },
    { name: 'city', type: 'text', required: true },
    { name: 'state', type: 'text', required: true },
    { name: 'postalCode', type: 'text', required: true },
    { name: 'country', type: 'text', defaultValue: 'US', required: true },
    {
      name: 'isDefault',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'One default per company; synced to company default ship-to at checkout.' },
    },
  ],
}
