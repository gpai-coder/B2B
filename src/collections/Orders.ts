import type { CollectionConfig } from 'payload'

import {
  adminPanelAccess,
  companyReadAccess,
  staffFieldAccess,
  staffOnly,
} from '../access'
import { orderStaffAfterChange, orderStaffBeforeChange } from '@/lib/orders/order-staff-hooks'

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'company', 'status', 'poNumber', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: companyReadAccess(),
    /** Vendors place orders only via commerce server actions, not Payload REST. */
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  hooks: {
    beforeChange: [orderStaffBeforeChange],
    afterChange: [orderStaffAfterChange],
  },
  indexes: [
    { unique: true, fields: ['company', 'poNumber'] },
    { unique: true, fields: ['company', 'idempotencyKey'] },
  ],
  fields: [
    {
      name: 'orderNumber',
      type: 'text',
      unique: true,
      access: { update: staffFieldAccess },
      admin: {
        readOnly: true,
        description: 'Generated on submit if empty.',
      },
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
      access: { update: staffFieldAccess },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      access: { update: staffFieldAccess },
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Submitted', value: 'submitted' },
        { label: 'Confirmed', value: 'confirmed' },
        { label: 'Shipped', value: 'shipped' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      name: 'carrier',
      type: 'text',
      access: { update: staffFieldAccess },
      admin: { description: 'Optional when marking shipped.' },
    },
    {
      name: 'trackingNumber',
      type: 'text',
      access: { update: staffFieldAccess },
      admin: { description: 'Optional when marking shipped.' },
    },
    {
      name: 'poNumber',
      type: 'text',
      access: { update: staffFieldAccess },
    },
    {
      name: 'quote',
      type: 'relationship',
      relationTo: 'quotes',
      access: { update: staffFieldAccess },
    },
    {
      name: 'idempotencyKey',
      type: 'text',
      access: { update: staffFieldAccess },
      admin: {
        description: 'Client-supplied key to dedupe submit requests.',
      },
      index: true,
    },
    {
      name: 'orderNotes',
      type: 'textarea',
      access: { update: staffFieldAccess },
    },
    {
      name: 'shipTo',
      type: 'group',
      access: { update: staffFieldAccess },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'line1', type: 'text', required: true },
        { name: 'line2', type: 'text' },
        { name: 'city', type: 'text', required: true },
        { name: 'state', type: 'text', required: true },
        { name: 'postalCode', type: 'text', required: true },
        { name: 'country', type: 'text', required: true, defaultValue: 'US' },
      ],
    },
    {
      name: 'lines',
      type: 'array',
      required: true,
      access: { update: staffFieldAccess },
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
        {
          name: 'unitPrice',
          type: 'number',
          required: true,
          min: 0,
        },
      ],
    },
  ],
}
