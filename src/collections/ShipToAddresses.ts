import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import {
  adminPanelAccess,
  approvedVendorCompanyReadAccess,
  getUserCompanyId,
  isStaff,
  staffFieldAccess,
  staffOnly,
} from '../access'
import {
  shipToStaffAfterChange,
  shipToStaffAfterDelete,
  shipToStaffBeforeChange,
} from '../lib/vendor/ship-to-staff-hooks'
import { SHIP_TO_TRUSTED_MUTATION } from '../lib/vendor/ship-to-trusted'
import type { User } from '../payload-types'

export { SHIP_TO_TRUSTED_MUTATION } from '../lib/vendor/ship-to-trusted'

function assertShipToCompanyImmutable({
  data,
  originalDoc,
  req,
  operation,
}: Parameters<CollectionBeforeChangeHook>[0]) {
  const user = req.user as User | undefined
  if (!user || isStaff(user)) return data

  const companyId = getUserCompanyId(user)
  if (!companyId) {
    throw new Error('Forbidden')
  }

  const trusted = Boolean(
    (req.context as Record<string, unknown> | undefined)?.[SHIP_TO_TRUSTED_MUTATION],
  )
  if (!trusted) {
    throw new Error('Ship-to address changes must use the account portal.')
  }

  if (operation === 'update' && originalDoc) {
    const prevCompany =
      typeof originalDoc.company === 'object' ? originalDoc.company?.id : originalDoc.company
    if (Number(prevCompany) !== companyId) {
      throw new Error('Address not found.')
    }
  }

  const nextCompany =
    data?.company != null
      ? typeof data.company === 'object'
        ? (data.company as { id?: number }).id
        : data.company
      : undefined
  if (nextCompany != null && Number(nextCompany) !== companyId) {
    throw new Error('Address not found.')
  }

  return {
    ...(data ?? {}),
    company: companyId,
  }
}

export const ShipToAddresses: CollectionConfig = {
  slug: 'ship-to-addresses',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'company', 'isDefault', 'city', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: approvedVendorCompanyReadAccess('company'),
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  hooks: {
    beforeChange: [shipToStaffBeforeChange, assertShipToCompanyImmutable],
    afterChange: [shipToStaffAfterChange],
    afterDelete: [shipToStaffAfterDelete],
  },
  fields: [
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      index: true,
      access: {
        create: staffFieldAccess,
        update: staffFieldAccess,
      },
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
      access: {
        create: staffFieldAccess,
        update: staffFieldAccess,
      },
    },
  ],
}
