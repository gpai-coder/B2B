import type { Payload, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { emptyEquivalent } from '@/lib/orders/order-frozen-compare'
import { resolveUnitPriceForCompany } from '@/lib/pricing/resolve-unit-price'
import { defaultQuoteExpiresAt } from '@/lib/quotes/quote-workflow'

function fieldPresent(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key)
}

function lineNeedsPrice(line: Record<string, unknown>): boolean {
  if (line.unitPrice == null || line.unitPrice === '') return true
  return Number.isNaN(Number(line.unitPrice))
}

export async function enrichDraftLinePrices(
  payload: Payload,
  req: PayloadRequest,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const companyRaw = data.company
  const companyId =
    typeof companyRaw === 'object' && companyRaw != null
      ? Number((companyRaw as { id: number }).id)
      : companyRaw != null
        ? Number(companyRaw)
        : null
  if (companyId == null || Number.isNaN(companyId)) return data
  const lines = data.lines
  if (!Array.isArray(lines) || lines.length === 0) return data

  const readOpts = { overrideAccess: true as const, req }
  const enriched = await Promise.all(
    lines.map(async (line) => {
      const row = line as Record<string, unknown>
      if (!lineNeedsPrice(row)) return row
      const variantRaw = row.variant
      const variantId =
        typeof variantRaw === 'object' && variantRaw != null
          ? Number((variantRaw as { id: number }).id)
          : variantRaw != null
            ? Number(variantRaw)
            : null
      const sku = String(row.sku ?? '')
      const quantity = Number(row.quantity ?? 1)
      if (variantId == null || Number.isNaN(variantId) || !sku) return row
      const price = await resolveUnitPriceForCompany(
        payload,
        companyId,
        variantId,
        sku,
        quantity,
        readOpts,
      )
      if (!price) return row
      return { ...row, unitPrice: price.unitPrice }
    }),
  )
  return { ...data, lines: enriched }
}

export function assertDraftLinePricesPresent(data: Record<string, unknown>): void {
  const lines = data.lines
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new APIError('Quote requires at least one line.', 400)
  }
  for (const line of lines) {
    const row = line as Record<string, unknown>
    if (lineNeedsPrice(row)) {
      throw new APIError('No price available for one or more quote lines.', 400)
    }
  }
}

export async function prepareQuoteDraftData(
  payload: Payload,
  req: PayloadRequest,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let next = { ...data }
  if (!fieldPresent(next, 'expiresAt') || emptyEquivalent(next.expiresAt, null)) {
    next = { ...next, expiresAt: defaultQuoteExpiresAt() }
  }
  next = await enrichDraftLinePrices(payload, req, next)
  assertDraftLinePricesPresent(next)
  return next
}
