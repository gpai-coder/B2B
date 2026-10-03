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
  orderNotes?: string | null
  quoteId?: string | null
  idempotencyKey?: string | null
  lines: CommerceOrderLine[]
  createdAt?: string
}

export type CheckoutInput = {
  poNumber: string
  shipTo: CreateDraftOrderInput['shipTo']
  orderNotes?: string
  idempotencyKey: string
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
  addCartQuantity(companyId: string, sku: string, quantityToAdd: number): Promise<CartLine[]>
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
  submitCartCheckout(companyId: string, input: CheckoutInput): Promise<CommerceOrder>
  convertQuoteToOrder(
    companyId: string,
    quoteId: string,
    input: CheckoutInput,
  ): Promise<CommerceOrder>
  listOrders(companyId: string): Promise<CommerceOrder[]>
  createDraftOrder(input: CreateDraftOrderInput): Promise<CommerceOrder>
  submitOrder(orderId: string, idempotencyKey: string, companyId: string): Promise<CommerceOrder>
  getOrder(orderId: string, companyId: string): Promise<CommerceOrder | null>
  listQuotes(companyId: string): Promise<CommerceQuote[]>
  getQuote(quoteId: string, companyId: string): Promise<CommerceQuote | null>
}
