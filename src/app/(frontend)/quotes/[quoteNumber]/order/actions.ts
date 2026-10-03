'use server'

import { randomUUID } from 'crypto'

import { revalidatePath } from 'next/cache'

import { CartValidationError, getCommerce } from '@/commerce'
import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { validatePoNumber } from '@/lib/checkout/validate-po'
import {
  QUOTE_NOT_AVAILABLE_MESSAGE,
  quoteOrderAvailability,
} from '@/lib/quotes/quote-order-eligibility'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

export type QuoteOrderActionResult = { ok: true; orderId: string } | { ok: false; error: string }

function quoteOrderActionError(err: unknown): string {
  if (err instanceof CartValidationError) return err.message
  if (err instanceof Error && err.message === 'Quote not found') {
    return QUOTE_NOT_AVAILABLE_MESSAGE
  }
  console.error('[quote-order] submit failed', err)
  return 'Could not submit order from this quote. Please try again.'
}

export async function submitQuoteOrderAction(
  quoteNumber: string,
  formData: FormData,
): Promise<QuoteOrderActionResult> {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    return { ok: false, error: 'Authentication required.' }
  }
  if (!user.approved) {
    return { ok: false, error: PENDING_APPROVAL }
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) return { ok: false, error: 'Vendor account is missing a company.' }

  const po = validatePoNumber(formData.get('poNumber')?.toString() ?? `PO-${quoteNumber}`)
  if (!po.ok) return { ok: false, error: po.error }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const req = createPayloadReq(payload, user)
  const quotes = await payload.find({
    collection: 'quotes',
    where: { quoteNumber: { equals: quoteNumber } },
    limit: 1,
    overrideAccess: false,
    req,
  })
  const quoteDoc = quotes.docs[0]
  const availability = quoteOrderAvailability(quoteDoc, companyId)
  if (!availability.ok) {
    return { ok: false, error: availability.message }
  }

  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req,
  })
  const defaultShip = shipToFromCompanyDefault(company.defaultShipTo)
  const shipTo = {
    name: String(formData.get('shipToName') ?? defaultShip?.name ?? '').trim(),
    line1: String(formData.get('shipToLine1') ?? defaultShip?.line1 ?? '').trim(),
    line2: String(formData.get('shipToLine2') ?? defaultShip?.line2 ?? '').trim() || undefined,
    city: String(formData.get('shipToCity') ?? defaultShip?.city ?? '').trim(),
    state: String(formData.get('shipToState') ?? defaultShip?.state ?? '').trim(),
    postalCode: String(formData.get('shipToPostalCode') ?? defaultShip?.postalCode ?? '').trim(),
    country: String(formData.get('shipToCountry') ?? defaultShip?.country ?? 'US').trim() || 'US',
  }
  if (!shipTo.name || !shipTo.line1 || !shipTo.city || !shipTo.state || !shipTo.postalCode) {
    return { ok: false, error: 'Complete ship-to address is required.' }
  }

  const idempotencyKey = String(formData.get('idempotencyKey') ?? randomUUID()).trim()
  const orderNotes = String(formData.get('orderNotes') ?? '').trim() || undefined

  try {
    const commerce = await getCommerce({ user })
    const submitted = await commerce.convertQuoteToOrder(companyId, String(quoteDoc!.id), {
      poNumber: po.poNumber,
      shipTo,
      orderNotes,
      idempotencyKey,
    })
    revalidatePath('/orders')
    revalidatePath(`/quotes/${quoteNumber}/order`)
    return { ok: true, orderId: submitted.id }
  } catch (err) {
    return { ok: false, error: quoteOrderActionError(err) }
  }
}
