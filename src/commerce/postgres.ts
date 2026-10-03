import type { Payload, PayloadRequest, Where } from 'payload'

import type { User } from '@/payload-types'
import { createPayloadReq } from '@/lib/payload-req'
import { parseCartQuantity } from '@/lib/cart/quantity-rules'
import { getUserCompanyId } from '@/access'

import type {
  CartLine,
  CheckoutInput,
  CommerceOrder,
  CommerceQuote,
  CommerceService,
  CreateDraftOrderInput,
  PriceQuote,
  PricedCartLine,
} from './types'
import { isUniqueViolation } from './db-errors'
import {
  assertValidCartQuantity,
  CartValidationError,
  loadVariantCartMeta,
  loadVariantForOrdering,
  unavailableReason,
} from './cart-helpers'
import { applyQuickOrderLines, previewQuickOrderLines } from './quick-order'
import { runCartMutation } from './cart-serialized'
import { submitCartCheckout, convertQuoteToOrder } from './checkout'

export { CartValidationError } from './cart-helpers'
export { CartBusyError } from './cart-serialized'

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
    orderNotes: (doc.orderNotes as string | null) ?? null,
    quoteId: doc.quote
      ? String(typeof doc.quote === 'object' ? (doc.quote as { id: number }).id : doc.quote)
      : null,
    idempotencyKey: (doc.idempotencyKey as string | null) ?? null,
    createdAt: doc.createdAt ? String(doc.createdAt) : undefined,
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

  const txReadOpts = (req?: PayloadRequest) =>
    req
      ? actingUser
        ? { overrideAccess: false as const, req }
        : { overrideAccess: true as const, req }
      : readOpts()

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
    req?: PayloadRequest,
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
      ...txReadOpts(req),
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
        priceListName: source === 'company' ? (list.name ?? undefined) : undefined,
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

  async function getOrCreateCartDoc(companyId: string, req?: PayloadRequest) {
    if (!actingUser) throw new Error('Authentication required')
    assertCompanyMatchesUser(actingUser, companyId)
    const where: Where = {
      and: [{ user: { equals: actingUser.id } }, { company: { equals: Number(companyId) } }],
    }
    const findOpts = req ? { req, overrideAccess: true as const } : { overrideAccess: true as const }
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await payload.find({
        collection: 'carts',
        where,
        limit: 1,
        ...findOpts,
      })
      if (existing.docs[0]) return existing.docs[0]
      try {
        return await payload.create({
          collection: 'carts',
          data: {
            user: actingUser.id,
            company: Number(companyId),
            lines: [],
          },
          ...findOpts,
        })
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 2) continue
        throw err
      }
    }
    throw new Error('Could not create cart.')
  }

  function mapCartLines(doc: { lines?: Array<{ sku: string; quantity: number }> | null }): CartLine[] {
    return (doc.lines ?? []).map((line) => ({
      sku: line.sku,
      quantity: Number(line.quantity),
    }))
  }

  async function persistCartLines(
    cartId: number,
    lines: CartLine[],
    options?: { validateQuantityForSku?: string; req?: PayloadRequest },
  ) {
    const writeOpts = options?.req
      ? { req: options.req, overrideAccess: true as const }
      : { overrideAccess: true as const }
    const enriched = []
    for (const line of lines) {
      const meta = await loadVariantCartMeta(payload, line.sku, txReadOpts(options?.req))
      if (options?.validateQuantityForSku === line.sku) {
        await loadVariantForOrdering(payload, line.sku, txReadOpts(options?.req))
        assertValidCartQuantity(line.quantity, meta)
      }
      enriched.push({
        sku: line.sku,
        variant: meta.variantId,
        quantity: line.quantity,
      })
    }
    const updated = await payload.update({
      collection: 'carts',
      id: cartId,
      data: { lines: enriched },
      ...writeOpts,
    })
    return mapCartLines(updated)
  }

  function checkoutDeps(companyId: string) {
    if (!actingUser) throw new Error('Authentication required')
    return {
      payload,
      actingUser,
      companyId,
      txReadOpts,
      resolveUnitPrice,
      persistCartLines: (cartId: number, cartLines: CartLine[], req: PayloadRequest) =>
        persistCartLines(cartId, cartLines, { req }),
      runCartMutation: (mutate: Parameters<typeof runCartMutation>[0]['mutate']) =>
        runCartMutation({ payload, actingUser, companyId, getOrCreateCartDoc, mutate }),
      createReq: () => createPayloadReq(payload, actingUser),
      mapOrder,
    }
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

    async getCart(companyId) {
      assertCompanyMatchesUser(actingUser, companyId)
      const cart = await getOrCreateCartDoc(companyId)
      return mapCartLines(cart)
    },

    async getCartSummary(companyId) {
      assertCompanyMatchesUser(actingUser, companyId)
      const cart = await getOrCreateCartDoc(companyId)
      const lines = mapCartLines(cart)
      const priced: PricedCartLine[] = []
      let subtotal = 0
      let currency = 'USD'
      for (const line of lines) {
        const meta = await loadVariantCartMeta(payload, line.sku, readOpts())
        const blocked = unavailableReason(meta)
        if (blocked) {
          priced.push({
            sku: line.sku,
            quantity: line.quantity,
            productName: meta.productName,
            available: false,
            unavailableReason: blocked,
          })
          continue
        }
        const variantIds = await findVariantIdsBySkus([line.sku])
        const variantId = variantIds.get(line.sku)
        const price = variantId
          ? await resolveUnitPrice(companyId, variantId, line.sku, line.quantity)
          : null
        if (!price) {
          priced.push({
            sku: line.sku,
            quantity: line.quantity,
            productName: meta.productName,
            available: false,
            unavailableReason: `No price available for ${line.sku}.`,
          })
          continue
        }
        const unitAmount = price.unitPrice.amount
        currency = price.unitPrice.currency
        const lineTotal = unitAmount * line.quantity
        subtotal += lineTotal
        priced.push({
          sku: line.sku,
          quantity: line.quantity,
          productName: meta.productName,
          available: true,
          unitPrice: price.unitPrice,
          lineTotal,
          source: price.source,
          quantityBreaks: price.quantityBreaks,
          moq: meta.moq,
          orderMultiple: meta.orderMultiple,
        })
      }
      return { lines: priced, subtotal, currency }
    },

    async setCartLine(companyId, sku, quantity) {
      assertCompanyMatchesUser(actingUser, companyId)
      if (!actingUser) throw new Error('Authentication required')
      return runCartMutation({
        payload,
        actingUser,
        companyId,
        getOrCreateCartDoc,
        mutate: async ({ lines, cartId, req }) => {
          if (quantity <= 0) {
            return persistCartLines(
              cartId,
              lines.filter((l) => l.sku !== sku),
              { req },
            )
          }
          const meta = await loadVariantForOrdering(payload, sku, txReadOpts(req))
          assertValidCartQuantity(quantity, meta)
          const next = lines.filter((l) => l.sku !== sku)
          next.push({ sku, quantity })
          return persistCartLines(cartId, next, { req, validateQuantityForSku: sku })
        },
      })
    },

    async addCartQuantity(companyId, sku, quantityToAdd) {
      assertCompanyMatchesUser(actingUser, companyId)
      if (!actingUser) throw new Error('Authentication required')
      const parsedAdd = parseCartQuantity(quantityToAdd)
      if (!parsedAdd.ok) throw new CartValidationError(parsedAdd.error)
      return runCartMutation({
        payload,
        actingUser,
        companyId,
        getOrCreateCartDoc,
        mutate: async ({ lines, cartId, req }) => {
          const current = lines.find((l) => l.sku === sku)?.quantity ?? 0
          const parsedTotal = parseCartQuantity(current + parsedAdd.quantity)
          if (!parsedTotal.ok) throw new CartValidationError(parsedTotal.error)
          const meta = await loadVariantForOrdering(payload, sku, txReadOpts(req))
          assertValidCartQuantity(parsedTotal.quantity, meta)
          const next = lines.filter((l) => l.sku !== sku)
          next.push({ sku, quantity: parsedTotal.quantity })
          return persistCartLines(cartId, next, { req, validateQuantityForSku: sku })
        },
      })
    },

    async removeCartLine(companyId, sku) {
      return this.setCartLine(companyId, sku, 0)
    },

    async previewQuickOrder(companyId, lines) {
      assertCompanyMatchesUser(actingUser, companyId)
      if (!actingUser) throw new Error('Authentication required')
      const quickDeps = {
        payload,
        actingUser,
        companyId,
        readOpts,
        resolveUnitPrice,
        persistCartLines: (cartId: number, cartLines: CartLine[], req: PayloadRequest) =>
          persistCartLines(cartId, cartLines, { req }),
        runCartMutation: (mutate: Parameters<typeof runCartMutation>[0]['mutate']) =>
          runCartMutation({ payload, actingUser, companyId, getOrCreateCartDoc, mutate }),
      }
      return previewQuickOrderLines(quickDeps, lines)
    },

    async applyQuickOrder(companyId, lines, idempotencyKey) {
      assertCompanyMatchesUser(actingUser, companyId)
      if (!actingUser) throw new Error('Authentication required')
      const quickDeps = {
        payload,
        actingUser,
        companyId,
        readOpts,
        resolveUnitPrice,
        persistCartLines: (cartId: number, cartLines: CartLine[], req: PayloadRequest) =>
          persistCartLines(cartId, cartLines, { req }),
        runCartMutation: (mutate: Parameters<typeof runCartMutation>[0]['mutate']) =>
          runCartMutation({ payload, actingUser, companyId, getOrCreateCartDoc, mutate }),
      }
      return applyQuickOrderLines(quickDeps, lines, idempotencyKey)
    },

    async submitCartCheckout(companyId, input: CheckoutInput) {
      assertCompanyMatchesUser(actingUser, companyId)
      return submitCartCheckout(checkoutDeps(companyId), input)
    },

    async convertQuoteToOrder(companyId, quoteId, input: CheckoutInput) {
      assertCompanyMatchesUser(actingUser, companyId)
      return convertQuoteToOrder(checkoutDeps(companyId), { quoteId, ...input })
    },

    async listOrders(companyId) {
      assertCompanyMatchesUser(actingUser, companyId)
      const result = await payload.find({
        collection: 'orders',
        where: { company: { equals: Number(companyId) } },
        sort: '-createdAt',
        limit: 100,
        ...readOpts(),
      })
      return result.docs.map((doc) => mapOrder(doc as unknown as Record<string, unknown>))
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
        where: {
          and: [
            { company: { equals: Number(companyId) } },
            { idempotencyKey: { equals: idempotencyKey } },
          ],
        },
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
      let doc
      try {
        doc = await payload.findByID({
          collection: 'orders',
          id: orderId,
          ...readOpts(),
        })
      } catch (err) {
        const status = (err as { status?: number }).status
        if (status === 404) return null
        throw err
      }
      const mapped = mapOrder(doc as unknown as Record<string, unknown>)
      if (mapped.companyId !== companyId) return null
      return mapped
    },
  }
}
