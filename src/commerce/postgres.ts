import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { createPayloadReq } from '@/lib/payload-req'
import { getUserCompanyId } from '@/access'

import type {
  CommerceOrder,
  CommerceQuote,
  CommerceService,
  CreateDraftOrderInput,
  PriceQuote,
} from './types'

function money(amount: number, currency = 'USD') {
  return { amount, currency }
}

function reqFor(payload: Payload, user: User | null): PayloadRequest | undefined {
  if (!user) return undefined
  return createPayloadReq(payload, user)
}

function mapOrder(doc: Record<string, unknown>): CommerceOrder {
  const lines = (doc.lines as Array<Record<string, unknown>> | undefined) ?? []
  return {
    id: String(doc.id),
    orderNumber: (doc.orderNumber as string | null) ?? null,
    companyId: String(typeof doc.company === 'object' ? (doc.company as { id: number }).id : doc.company),
    status: String(doc.status),
    poNumber: (doc.poNumber as string | null) ?? null,
    quoteId: doc.quote
      ? String(typeof doc.quote === 'object' ? (doc.quote as { id: number }).id : doc.quote)
      : null,
    idempotencyKey: (doc.idempotencyKey as string | null) ?? null,
    lines: lines.map((line) => ({
      sku: String(line.sku),
      quantity: Number(line.quantity),
      unitPrice: money(Number(line.unitPrice)),
    })),
  }
}

function mapQuote(doc: Record<string, unknown>): CommerceQuote {
  const lines = (doc.lines as Array<Record<string, unknown>> | undefined) ?? []
  return {
    id: String(doc.id),
    quoteNumber: String(doc.quoteNumber),
    companyId: String(typeof doc.company === 'object' ? (doc.company as { id: number }).id : doc.company),
    status: String(doc.status),
    expiresAt: String(doc.expiresAt),
    lines: lines.map((line) => ({
      sku: String(line.sku),
      quantity: Number(line.quantity),
      unitPrice: money(Number(line.unitPrice)),
    })),
  }
}

function assertCompanyMatchesUser(user: User | null, companyId: string) {
  if (!user) return
  const userCompany = getUserCompanyId(user)
  if (!userCompany || String(userCompany) !== companyId) {
    throw new Error('Order company does not match authenticated vendor')
  }
}

export function createPostgresCommerceService(
  payload: Payload,
  actingUser: User | null,
): CommerceService {
  const readOpts = () =>
    actingUser
      ? { overrideAccess: false as const, req: reqFor(payload, actingUser)! }
      : { overrideAccess: true as const }

  async function findVariantIdsBySkus(skus: string[]) {
    const result = await payload.find({
      collection: 'product-variants',
      where: { sku: { in: skus } },
      limit: skus.length,
      ...readOpts(),
    })
    const map = new Map<string, number>()
    for (const doc of result.docs) {
      map.set(doc.sku, doc.id)
    }
    return map
  }

  async function resolveUnitPrice(
    companyId: string,
    variantId: number,
    sku: string,
    quantity = 1,
  ): Promise<PriceQuote | null> {
    const result = await payload.find({
      collection: 'price-lists',
      where: {
        or: [
          { and: [{ kind: { equals: 'company' } }, { company: { equals: Number(companyId) } }] },
          { kind: { equals: 'standard' } },
        ],
      },
      limit: 10,
      ...readOpts(),
    })

    const companyList = result.docs.find((l) => l.kind === 'company')
    const standardList = result.docs.find((l) => l.kind === 'standard')

    const pickFromList = (list: (typeof result.docs)[0] | undefined, source: 'company' | 'standard') => {
      if (!list?.lines) return null
      const line = list.lines.find((entry) => {
        const v = entry.variant
        const id = typeof v === 'object' ? v.id : v
        return id === variantId
      })
      if (!line) return null
      let price = line.unitPrice ?? 0
      const breaks = line.quantityBreaks ?? []
      for (const br of breaks) {
        if (quantity >= (br.minQuantity ?? 0) && br.unitPrice != null) {
          price = br.unitPrice
        }
      }
      const quantityBreaks = breaks
        .filter((br) => br.minQuantity != null && br.unitPrice != null)
        .map((br) => ({ minQuantity: br.minQuantity!, unitPrice: br.unitPrice! }))
        .sort((a, b) => a.minQuantity - b.minQuantity)
      return {
        sku,
        unitPrice: money(price, line.currency ?? 'USD'),
        source,
        quantityBreaks: quantityBreaks.length > 0 ? quantityBreaks : undefined,
      }
    }

    return pickFromList(companyList, 'company') ?? pickFromList(standardList, 'standard') ?? null
  }

  /** Privileged read after explicit companyId check (commerce writes / tests). */
  async function getQuoteTrusted(quoteId: string, companyId: string) {
    const doc = await payload.findByID({
      collection: 'quotes',
      id: quoteId,
      overrideAccess: true,
    })
    const mapped = mapQuote(doc as unknown as Record<string, unknown>)
    if (mapped.companyId !== companyId) return null
    return mapped
  }

  return {
    async getPrices(customerId, skus) {
      if (actingUser) assertCompanyMatchesUser(actingUser, customerId)
      if (skus.length === 0) return []
      const variantIds = await findVariantIdsBySkus(skus)
      const prices: PriceQuote[] = []
      for (const sku of skus) {
        const variantId = variantIds.get(sku)
        if (!variantId) continue
        const price = await resolveUnitPrice(customerId, variantId, sku)
        if (price) prices.push(price)
      }
      return prices
    },

    async listQuotes(companyId) {
      if (actingUser) assertCompanyMatchesUser(actingUser, companyId)
      const result = await payload.find({
        collection: 'quotes',
        where: { company: { equals: Number(companyId) } },
        limit: 100,
        ...readOpts(),
      })
      return result.docs.map((doc) => mapQuote(doc as unknown as Record<string, unknown>))
    },

    async getQuote(quoteId, companyId) {
      if (actingUser) assertCompanyMatchesUser(actingUser, companyId)
      if (actingUser) {
        const result = await payload.find({
          collection: 'quotes',
          where: { id: { equals: Number(quoteId) } },
          limit: 1,
          overrideAccess: false,
          req: reqFor(payload, actingUser)!,
        })
        const doc = result.docs[0]
        if (!doc) return null
        return mapQuote(doc as unknown as Record<string, unknown>)
      }
      return getQuoteTrusted(quoteId, companyId)
    },

    async createDraftOrder(input) {
      assertCompanyMatchesUser(actingUser, input.companyId)

      let lines = input.lines ?? []
      if (input.quoteId) {
        const quote = await getQuoteTrusted(input.quoteId, input.companyId)
        if (!quote) throw new Error('Quote not found for company')
        lines = quote.lines.map((l) => ({ sku: l.sku, quantity: l.quantity }))
      }

      const enriched = []
      for (const line of lines) {
        const [price] = await this.getPrices(input.companyId, [line.sku])
        if (!price) throw new Error(`No price for SKU ${line.sku}`)
        const variant = await payload.find({
          collection: 'product-variants',
          where: { sku: { equals: line.sku } },
          limit: 1,
          ...readOpts(),
        })
        enriched.push({
          sku: line.sku,
          variant: variant.docs[0]?.id,
          quantity: line.quantity,
          unitPrice: price.unitPrice.amount,
        })
      }

      // Privileged write: prices computed server-side; company + quote validated above.
      const created = await payload.create({
        collection: 'orders',
        data: {
          company: Number(input.companyId),
          status: 'draft',
          poNumber: input.poNumber,
          quote: input.quoteId ? Number(input.quoteId) : undefined,
          shipTo: input.shipTo,
          lines: enriched,
        },
        overrideAccess: true,
      })

      return mapOrder(created as unknown as Record<string, unknown>)
    },

    async submitOrder(orderId, idempotencyKey, companyId) {
      assertCompanyMatchesUser(actingUser, companyId)

      const existing = await payload.find({
        collection: 'orders',
        where: { idempotencyKey: { equals: idempotencyKey } },
        limit: 1,
        overrideAccess: true,
      })
      if (existing.docs[0]) {
        const mapped = mapOrder(existing.docs[0] as unknown as Record<string, unknown>)
        if (mapped.companyId !== companyId) throw new Error('Idempotency key conflict')
        return mapped
      }

      const order = await payload.findByID({
        collection: 'orders',
        id: orderId,
        ...(actingUser
          ? { overrideAccess: false, req: reqFor(payload, actingUser)! }
          : { overrideAccess: true }),
      })
      const current = mapOrder(order as unknown as Record<string, unknown>)
      if (current.companyId !== companyId) throw new Error('Order not found')
      if (current.status !== 'draft') return current

      const orderNumber =
        current.orderNumber ??
        `ORD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900000) + 100000)}`

      // Privileged write: status transition only after company ownership verified.
      const updated = await payload.update({
        collection: 'orders',
        id: orderId,
        data: {
          status: 'submitted',
          orderNumber,
          idempotencyKey,
        },
        overrideAccess: true,
      })

      return mapOrder(updated as unknown as Record<string, unknown>)
    },

    async getOrder(orderId, companyId) {
      if (actingUser) assertCompanyMatchesUser(actingUser, companyId)
      const doc = await payload.findByID({
        collection: 'orders',
        id: orderId,
        ...readOpts(),
      })
      const mapped = mapOrder(doc as unknown as Record<string, unknown>)
      if (mapped.companyId !== companyId) return null
      return mapped
    },
  }
}
