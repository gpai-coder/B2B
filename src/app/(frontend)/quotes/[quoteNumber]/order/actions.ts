'use server'

import { randomUUID } from 'crypto'

import { redirect } from 'next/navigation'

import { getCommerce } from '@/commerce'
import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { validatePoNumber } from '@/lib/checkout/validate-po'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'

export async function createAndSubmitQuoteOrder(quoteNumber: string, formData: FormData) {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    throw new Error('Unauthorized')
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) throw new Error('Missing company')

  const po = validatePoNumber(formData.get('poNumber')?.toString() ?? `PO-${quoteNumber}`)
  if (!po.ok) throw new Error(po.error)

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const quotes = await payload.find({
    collection: 'quotes',
    where: { quoteNumber: { equals: quoteNumber } },
    limit: 1,
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
  const quoteDoc = quotes.docs[0]
  if (!quoteDoc) throw new Error('Quote not found')

  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req: createPayloadReq(payload, user),
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
    throw new Error('Complete ship-to address is required.')
  }

  const idempotencyKey = String(formData.get('idempotencyKey') ?? randomUUID()).trim()
  const orderNotes = String(formData.get('orderNotes') ?? '').trim() || undefined

  const commerce = await getCommerce({ user })
  const submitted = await commerce.convertQuoteToOrder(companyId, String(quoteDoc.id), {
    poNumber: po.poNumber,
    shipTo,
    orderNotes,
    idempotencyKey,
  })
  redirect(`/orders/${submitted.id}?submitted=1`)
}
