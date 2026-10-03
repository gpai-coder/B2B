export const PRODUCT_DOCUMENT_TYPES = [
  'spec-sheet',
  'install-instructions',
  'parts-diagram',
] as const

export type ProductDocumentType = (typeof PRODUCT_DOCUMENT_TYPES)[number]

export const PRODUCT_DOCUMENT_LABELS: Record<ProductDocumentType, string> = {
  'spec-sheet': 'Specification sheet',
  'install-instructions': 'Installation instructions',
  'parts-diagram': 'Parts diagram',
}
