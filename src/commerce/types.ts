export type Money = {
  amount: number
  currency: string
}

export type PriceQuote = {
  sku: string
  unitPrice: Money
  source: 'company' | 'standard'
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

export interface CommerceService {
  getPrices(customerId: string, skus: string[]): Promise<PriceQuote[]>
  createDraftOrder(input: CreateDraftOrderInput): Promise<CommerceOrder>
  submitOrder(orderId: string, idempotencyKey: string, companyId: string): Promise<CommerceOrder>
  getOrder(orderId: string, companyId: string): Promise<CommerceOrder | null>
  listQuotes(companyId: string): Promise<CommerceQuote[]>
  getQuote(quoteId: string, companyId: string): Promise<CommerceQuote | null>
}
