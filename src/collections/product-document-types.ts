export const PRODUCT_DOCUMENT_TYPES = [
  'spec-sheet',
  'install-instructions',
  'parts-diagram',
] as const

export const PRODUCT_EXTERNAL_RESOURCE_TYPES = ['cad-2d', 'revit'] as const

export type ProductDocumentType = (typeof PRODUCT_DOCUMENT_TYPES)[number]
export type ProductExternalResourceType = (typeof PRODUCT_EXTERNAL_RESOURCE_TYPES)[number]

export const PRODUCT_DOCUMENT_LABELS: Record<ProductDocumentType, string> = {
  'spec-sheet': 'Spec Sheet',
  'install-instructions': 'Installation Guide',
  'parts-diagram': 'Repair Parts Diagram',
}

export const PRODUCT_EXTERNAL_RESOURCE_LABELS: Record<ProductExternalResourceType, string> = {
  'cad-2d': 'CAD Drawings 2D',
  revit: 'Revit Files',
}

export function mapAmericanStandardDocType(
  type: string,
): ProductDocumentType | ProductExternalResourceType | null {
  switch (type) {
    case 'specSheet':
      return 'spec-sheet'
    case 'installationGuide':
      return 'install-instructions'
    case 'repairPartsDiagram':
      return 'parts-diagram'
    case 'cad2d':
    case 'cad':
      return 'cad-2d'
    case 'revit':
      return 'revit'
    default:
      return null
  }
}
