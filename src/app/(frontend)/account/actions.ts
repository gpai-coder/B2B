'use server'

import { revalidatePath } from 'next/cache'

import {
  createVendorShipToAddress,
  deleteVendorShipToAddress,
  setVendorDefaultShipToAddress,
  ShipToAddressValidationError,
  updateVendorShipToAddress,
} from '@/lib/vendor/ship-to-addresses'
import { vendorPayloadContext } from '@/lib/account/vendor-payload-context'

export type AccountActionResult = { ok: true } | { ok: false; error: string }

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

function actionError(err: unknown): string {
  if (err instanceof ShipToAddressValidationError) return err.message
  console.error('[account]', err)
  return 'Something went wrong. Please try again.'
}

function parseAddressForm(formData: FormData) {
  return {
    label: String(formData.get('label') ?? ''),
    name: String(formData.get('name') ?? ''),
    line1: String(formData.get('line1') ?? ''),
    line2: String(formData.get('line2') ?? ''),
    city: String(formData.get('city') ?? ''),
    state: String(formData.get('state') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    country: String(formData.get('country') ?? 'US'),
  }
}

export async function createShipToAddressAction(formData: FormData): Promise<AccountActionResult> {
  const ctx = await vendorPayloadContext()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  try {
    await createVendorShipToAddress(ctx.payload, ctx.user, ctx.companyId, parseAddressForm(formData))
    revalidatePath('/account')
    revalidatePath('/account/addresses')
    revalidatePath('/checkout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: actionError(err) }
  }
}

export async function updateShipToAddressAction(
  addressId: string,
  formData: FormData,
): Promise<AccountActionResult> {
  const ctx = await vendorPayloadContext()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  try {
    await updateVendorShipToAddress(
      ctx.payload,
      ctx.user,
      ctx.companyId,
      addressId,
      parseAddressForm(formData),
    )
    revalidatePath('/account/addresses')
    revalidatePath('/checkout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: actionError(err) }
  }
}

export async function deleteShipToAddressAction(addressId: string): Promise<AccountActionResult> {
  const ctx = await vendorPayloadContext()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  try {
    await deleteVendorShipToAddress(ctx.payload, ctx.user, ctx.companyId, addressId)
    revalidatePath('/account/addresses')
    revalidatePath('/checkout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: actionError(err) }
  }
}

export async function setDefaultShipToAddressAction(addressId: string): Promise<AccountActionResult> {
  const ctx = await vendorPayloadContext()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  try {
    await setVendorDefaultShipToAddress(ctx.payload, ctx.user, ctx.companyId, addressId)
    revalidatePath('/account/addresses')
    revalidatePath('/checkout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: actionError(err) }
  }
}
