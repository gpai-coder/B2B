'use server'

import { revalidatePath } from 'next/cache'

import { CartValidationError, getCommerce } from '@/commerce'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export type CartActionResult = { ok: true } | { ok: false; error: string }

async function requireVendor(): Promise<{ companyId: string; user: NonNullable<Awaited<ReturnType<typeof getRequestUser>>> }> {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    throw new Error('Authentication required')
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) throw new Error('Vendor account is missing a company.')
  return { companyId, user }
}

export async function addToCartAction(sku: string, quantity: number): Promise<CartActionResult> {
  try {
    const { companyId, user } = await requireVendor()
    const commerce = await getCommerce({ user })
    const existing = await commerce.getCart(companyId)
    const current = existing.find((l) => l.sku === sku)?.quantity ?? 0
    await commerce.setCartLine(companyId, sku, current + quantity)
    revalidatePath('/cart')
    revalidatePath('/catalog')
    return { ok: true }
  } catch (err) {
    const message = err instanceof CartValidationError ? err.message : 'Could not update cart.'
    return { ok: false, error: message }
  }
}

export async function setCartLineAction(sku: string, quantity: number): Promise<CartActionResult> {
  try {
    const { companyId, user } = await requireVendor()
    const commerce = await getCommerce({ user })
    await commerce.setCartLine(companyId, sku, quantity)
    revalidatePath('/cart')
    return { ok: true }
  } catch (err) {
    const message = err instanceof CartValidationError ? err.message : 'Could not update cart.'
    return { ok: false, error: message }
  }
}

export async function removeFromCartAction(sku: string): Promise<CartActionResult> {
  try {
    const { companyId, user } = await requireVendor()
    const commerce = await getCommerce({ user })
    await commerce.removeCartLine(companyId, sku)
    revalidatePath('/cart')
    return { ok: true }
  } catch (err) {
    const message = err instanceof CartValidationError ? err.message : 'Could not update cart.'
    return { ok: false, error: message }
  }
}
