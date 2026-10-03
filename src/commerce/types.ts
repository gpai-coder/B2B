export type Money = {
  amount: number
  currency: string
}

export type PriceQuote = {
  sku: string
  unitPrice: Money
  source: 'company' | 'standard'
  priceListName?: string
  quantityBreaks?: Array<{ minQuantity: number; unitPrice: number }>
}

export type CommerceQuoteLine = {
  sku: string
  quantity: number
  unitPrice: Money
}

export type CommerceQuote = {
  id: string
  quoteNumber: string
  companyId: string
  status: string
  expiresAt: string
  lines: CommerceQuoteLine[]
}

export type CommerceOrderLine = {
  sku: string
  quantity: number
  unitPrice: Money
}

export type CartLine = {
  sku: string
  quantity: number
}

export type PricedCartLine = CartLine & {
  productName: string
  available: boolean
  unavailableReason?: string
  unitPrice?: Money
  lineTotal?: number
  source?: 'company' | 'standard'
  quantityBreaks?: Array<{ minQuantity: number; unitPrice: number }>
  moq?: number
  orderMultiple?: number
}

export type CartSummary = {
  lines: PricedCartLine[]
  subtotal: number
  currency: string
}

export type CommerceOrder = {
  id: string
  orderNumber: string | null
  companyId: string
  status: string
  poNumber?: string | null
  quoteId?: string | null
  idempotencyKey?: string | null
  lines: CommerceOrderLine[]
}

export type CreateDraftOrderInput = {
  companyId: string
  quoteId?: string
  poNumber?: string
  shipTo: {
    name: string
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
    country: string
  }
  lines?: Array<{ sku: string; quantity: number }>
}

export type QuickOrderPreviewLine = {
  lineNumber: number
  sku: string
  quantity: number
  ok: boolean
  productName?: string
  unitPrice?: Money
  source?: 'company' | 'standard'
  error?: string
}

export type QuickOrderPreview = {
  lines: QuickOrderPreviewLine[]
}

export type QuickOrderApplyResult = {
  replay: boolean
  addedSkus: string[]
}

export interface CommerceService {
  getPrices(customerId: string, skus: string[]): Promise<PriceQuote[]>
  getCart(companyId: string): Promise<CartLine[]>
  getCartSummary(companyId: string): Promise<CartSummary>
  setCartLine(companyId: string, sku: string, quantity: number): Promise<CartLine[]>
  removeCartLine(companyId: string, sku: string): Promise<CartLine[]>
  previewQuickOrder(
    companyId: string,
    lines: Array<{ lineNumber: number; sku: string; quantity: number }>,
  ): Promise<QuickOrderPreview>
  applyQuickOrder(
    companyId: string,
    lines: Array<{ lineNumber: number; sku: string; quantity: number }>,
    idempotencyKey: string,
  ): Promise<QuickOrderApplyResult>
  createDraftOrder(input: CreateDraftOrderInput): Promise<CommerceOrder>
  submitOrder(orderId: string, idempotencyKey: string, companyId: string): Promise<CommerceOrder>
  getOrder(orderId: string, companyId: string): Promise<CommerceOrder | null>
  listQuotes(companyId: string): Promise<CommerceQuote[]>
  getQuote(quoteId: string, companyId: string): Promise<CommerceQuote | null>
}
