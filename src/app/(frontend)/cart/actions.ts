'use server'

import { revalidatePath } from 'next/cache'

import { CartValidationError, getCommerce } from '@/commerce'
import { CartBusyError } from '@/commerce/cart-serialized'
import { parseCartQuantity } from '@/lib/cart/quantity-rules'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export type CartActionResult = { ok: true } | { ok: false; error: string }

function cartActionError(err: unknown): string {
  if (err instanceof CartValidationError || err instanceof CartBusyError) return err.message
  return 'Could not update cart.'
}

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
  const parsedAdd = parseCartQuantity(quantity)
  if (!parsedAdd.ok) return { ok: false, error: parsedAdd.error }

  try {
    const { companyId, user } = await requireVendor()
    const commerce = await getCommerce({ user })
    await commerce.addCartQuantity(companyId, sku, parsedAdd.quantity)
    revalidatePath('/cart')
    revalidatePath('/catalog')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: cartActionError(err) }
  }
}

export async function setCartLineAction(sku: string, quantity: number): Promise<CartActionResult> {
  const parsed = parseCartQuantity(quantity)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  try {
    const { companyId, user } = await requireVendor()
    const commerce = await getCommerce({ user })
    await commerce.setCartLine(companyId, sku, parsed.quantity)
    revalidatePath('/cart')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: cartActionError(err) }
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
    return { ok: false, error: cartActionError(err) }
  }
}
