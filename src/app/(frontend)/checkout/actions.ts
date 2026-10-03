'use server'

import { randomUUID } from 'crypto'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { CartBusyError, CartValidationError, getCommerce } from '@/commerce'
import { shipToFromCompanyDefault } from '@/lib/checkout/ship-to'
import { validatePoNumber } from '@/lib/checkout/validate-po'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'

export type CheckoutActionResult = { ok: true; orderId: string } | { ok: false; error: string }

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

function checkoutError(err: unknown): string {
  if (err instanceof CartValidationError || err instanceof CartBusyError) return err.message
  console.error('[checkout] submit failed', err)
  return 'Checkout failed. Please try again.'
}

export async function submitCartCheckoutAction(
  formData: FormData,
  idempotencyKey: string,
): Promise<CheckoutActionResult> {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    return { ok: false, error: 'Authentication required.' }
  }
  if (!user.approved) {
    return { ok: false, error: PENDING_APPROVAL }
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) return { ok: false, error: 'Vendor account is missing a company.' }

  const po = validatePoNumber(formData.get('poNumber')?.toString())
  if (!po.ok) return { ok: false, error: po.error }

  const shipTo = {
    name: String(formData.get('shipToName') ?? '').trim(),
    line1: String(formData.get('shipToLine1') ?? '').trim(),
    line2: String(formData.get('shipToLine2') ?? '').trim() || undefined,
    city: String(formData.get('shipToCity') ?? '').trim(),
    state: String(formData.get('shipToState') ?? '').trim(),
    postalCode: String(formData.get('shipToPostalCode') ?? '').trim(),
    country: String(formData.get('shipToCountry') ?? 'US').trim() || 'US',
  }
  if (!shipTo.name || !shipTo.line1 || !shipTo.city || !shipTo.state || !shipTo.postalCode) {
    return { ok: false, error: 'Complete ship-to address is required.' }
  }

  const key = idempotencyKey.trim() || randomUUID()
  const orderNotes = String(formData.get('orderNotes') ?? '').trim() || undefined

  try {
    const commerce = await getCommerce({ user })
    const order = await commerce.submitCartCheckout(companyId, {
      poNumber: po.poNumber,
      shipTo,
      orderNotes,
      idempotencyKey: key,
    })
    revalidatePath('/cart')
    revalidatePath('/orders')
    return { ok: true, orderId: order.id }
  } catch (err) {
    return { ok: false, error: checkoutError(err) }
  }
}

export async function submitCartCheckoutAndRedirectAction(formData: FormData, idempotencyKey: string) {
  const result = await submitCartCheckoutAction(formData, idempotencyKey)
  if (!result.ok) {
    throw new Error(result.error)
  }
  redirect(`/orders/${result.orderId}?submitted=1`)
}

export async function loadCheckoutDefaultsAction(): Promise<{
  shipTo: ReturnType<typeof shipToFromCompanyDefault>
}> {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    throw new Error('Authentication required')
  }
  if (!user.approved) {
    throw new Error(PENDING_APPROVAL)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) return { shipTo: null }

  const payload = await getPayload({ config: await config })
  const company = await payload.findByID({
    collection: 'companies',
    id: Number(companyId),
    overrideAccess: false,
    req: createPayloadReq(payload, user),
  })
  return { shipTo: shipToFromCompanyDefault(company.defaultShipTo) }
}
