import type { CollectionConfig } from 'payload'

import { adminPanelAccess, catalogReadAccess, staffOnly } from '../access'

import {
  PRODUCT_DOCUMENT_TYPES,
  PRODUCT_DOCUMENT_LABELS,
  PRODUCT_EXTERNAL_RESOURCE_TYPES,
  PRODUCT_EXTERNAL_RESOURCE_LABELS,
} from './product-document-types'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'productCollection', 'slug', 'updatedAt'],
  },
  access: {
    admin: adminPanelAccess,
    read: catalogReadAccess,
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
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'URL-friendly identifier for PDP routes.',
      },
    },
    {
      name: 'modelNumber',
      type: 'text',
      admin: { description: 'Base model number (PLP MODEL line).' },
    },
    {
      name: 'productCollection',
      type: 'text',
      required: true,
      admin: {
        description: 'Design collection (e.g. Townsend, Champion).',
      },
    },
    {
      name: 'catalogCategory',
      type: 'select',
      options: [
        { label: 'Bathroom faucet', value: 'bathroom-faucet' },
        { label: 'Kitchen faucet', value: 'kitchen-faucet' },
        { label: 'Toilet', value: 'toilet' },
      ],
      admin: { description: 'Category for PLP facets and copy.' },
    },
    {
      name: 'catalogHidden',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Hide from vendor PLP and catalog search.' },
    },
    {
      name: 'breadcrumbs',
      type: 'array',
      fields: [{ name: 'label', type: 'text', required: true }],
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'shortBullets',
      type: 'array',
      admin: { description: 'Up to 3 short bullets for buy box.' },
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    {
      name: 'featureBullets',
      type: 'array',
      admin: { description: 'Full feature list (Product Overview).' },
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    {
      name: 'specGroups',
      type: 'array',
      admin: { description: 'Grouped specification tables (PDP Specifications).' },
      fields: [
        { name: 'groupName', type: 'text', required: true },
        {
          name: 'rows',
          type: 'array',
          fields: [
            { name: 'label', type: 'text', required: true },
            { name: 'value', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'specsTable',
      type: 'array',
      admin: { description: 'Legacy flat specs (optional).' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
      ],
    },
    {
      name: 'documents',
      type: 'array',
      admin: { description: 'Product-level PDFs and external downloads.' },
      fields: [
        {
          name: 'docType',
          type: 'select',
          required: true,
          options: [
            ...PRODUCT_DOCUMENT_TYPES.map((value) => ({
              label: PRODUCT_DOCUMENT_LABELS[value],
              value,
            })),
            ...PRODUCT_EXTERNAL_RESOURCE_TYPES.map((value) => ({
              label: PRODUCT_EXTERNAL_RESOURCE_LABELS[value],
              value,
            })),
          ],
        },
        {
          name: 'file',
          type: 'upload',
          relationTo: 'media',
          admin: { description: 'PDF upload (spec, install, parts diagram).' },
        },
        {
          name: 'externalUrl',
          type: 'text',
          admin: { description: 'External URL (CAD, Revit, etc.).' },
        },
        {
          name: 'displayName',
          type: 'text',
        },
      ],
    },
    {
      name: 'youtubeVideoId',
      type: 'text',
      admin: { description: 'YouTube video id for Installation / overview embed.' },
    },
    {
      name: 'facetMeta',
      type: 'group',
      admin: { description: 'PLP facet values derived from specs.' },
      fields: [
        { name: 'handleType', type: 'text' },
        { name: 'holesRequired', type: 'text' },
        { name: 'ada', type: 'text' },
        { name: 'bowlShape', type: 'text' },
        { name: 'flushTechnology', type: 'text' },
        { name: 'gpf', type: 'text' },
      ],
    },
    {
      name: 'primaryImage',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'PLP thumbnail / default PDP hero when no finish selected.' },
    },
    {
      name: 'gallery',
      type: 'array',
      admin: { description: 'Product-level gallery (lifestyle / alternate angles).' },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
  ],
}
