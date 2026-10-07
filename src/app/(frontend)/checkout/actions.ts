'use server'

import { randomUUID } from 'crypto'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { CartBusyError, CartValidationError, getCommerce } from '@/commerce'
import { loadCheckoutDefaultShipTo } from '@/lib/checkout/load-checkout-defaults'
import { parseCheckoutShipToFromForm } from '@/lib/checkout/parse-checkout-ship-to'
import { validatePoNumber } from '@/lib/checkout/validate-po'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

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

  const shipParsed = parseCheckoutShipToFromForm(formData)
  if (!shipParsed.ok) return { ok: false, error: shipParsed.error }
  const shipTo = shipParsed.shipTo

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
  shipTo: Awaited<ReturnType<typeof loadCheckoutDefaultShipTo>>['shipTo']
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

  return loadCheckoutDefaultShipTo(user, companyId)
}
