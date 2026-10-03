import { describe, expect, it } from 'vitest'

import { mapDocumentLabel } from '@/lib/catalog/document-labels'
import { resolveBlobMediaUrl } from '@/lib/blob-media-url'
import fs from 'fs'
import path from 'path'

describe('resolveBlobMediaUrl', () => {
  it('derives the public Blob URL from the read-write token store id', () => {
    expect(
      resolveBlobMediaUrl('seed-catalog__a b.jpg', { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_AbC123_xyz789' }),
    ).toBe('https://abc123.public.blob.vercel-storage.com/seed-catalog__a%20b.jpg')
  })
  it('prefers STORAGE_VERCEL_BLOB_BASE_URL', () => {
    expect(
      resolveBlobMediaUrl('x.pdf', { STORAGE_VERCEL_BLOB_BASE_URL: 'https://cdn.example.com/', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b' }),
    ).toBe('https://cdn.example.com/x.pdf')
  })
  it('returns null without Blob config', () => {
    expect(resolveBlobMediaUrl('x.pdf', {})).toBeNull()
  })
})

describe('document labels (server-safe)', () => {
  it('maps doc types and is not a client module', () => {
    expect(mapDocumentLabel('spec-sheet')).toBeTruthy()
    expect(mapDocumentLabel('spec-sheet', 'Custom')).toBe('Custom')
    const src = fs.readFileSync(path.resolve('src/lib/catalog/document-labels.ts'), 'utf8')
    expect(src).not.toMatch(/^['"]use client['"]/m)
    const page = fs.readFileSync(path.resolve('src/app/(frontend)/products/[slug]/page.tsx'), 'utf8')
    expect(page).not.toMatch(/mapDocumentLabel[^;]*from '@\/components\/catalog\/ProductDetailView'/s)
  })
})
