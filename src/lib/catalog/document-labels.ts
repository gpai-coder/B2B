import {
  PRODUCT_DOCUMENT_LABELS,
  PRODUCT_EXTERNAL_RESOURCE_LABELS,
} from '@/collections/product-document-types'

/**
 * Server-safe label helpers. Must NOT live in a 'use client' module: the PDP server
 * component calls mapDocumentLabel() while building its DTO, and calling a client
 * export from the server throws at render time (500 on every /products/[slug]).
 */
export function docLabel(docType: string, fallback: string) {
  if (docType in PRODUCT_DOCUMENT_LABELS) {
    return PRODUCT_DOCUMENT_LABELS[docType as keyof typeof PRODUCT_DOCUMENT_LABELS]
  }
  if (docType in PRODUCT_EXTERNAL_RESOURCE_LABELS) {
    return PRODUCT_EXTERNAL_RESOURCE_LABELS[docType as keyof typeof PRODUCT_EXTERNAL_RESOURCE_LABELS]
  }
  return fallback
}

export function mapDocumentLabel(docType: string, displayName?: string | null) {
  return displayName ?? docLabel(docType, docType)
}
