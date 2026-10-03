'use server'

import { revalidatePath } from 'next/cache'

import { getCommerce } from '@/commerce'
import type { QuickOrderApplyResult, QuickOrderPreview } from '@/commerce/types'
import {
  parseQuickOrderCsv,
  parseQuickOrderPaste,
  QuickOrderParseError,
} from '@/lib/quick-order/parse-input'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export type QuickOrderActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

async function requireApprovedVendor() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    throw new Error('Authentication required')
  }
  if (!user.approved) {
    throw new Error('Your account is pending administrator approval.')
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) throw new Error('Vendor account is missing a company.')
  return { user, companyId }
}

function parseInput(text: string, mode: 'paste' | 'csv') {
  return mode === 'csv' ? parseQuickOrderCsv(text) : parseQuickOrderPaste(text)
}

export async function previewQuickOrderAction(
  text: string,
  mode: 'paste' | 'csv',
): Promise<QuickOrderActionResult<QuickOrderPreview>> {
  try {
    const { user, companyId } = await requireApprovedVendor()
    const lines = parseInput(text, mode)
    const commerce = await getCommerce({ user })
    const preview = await commerce.previewQuickOrder(companyId, lines)
    return { ok: true, data: preview }
  } catch (err) {
    const message =
      err instanceof QuickOrderParseError ? err.message : err instanceof Error ? err.message : 'Could not validate.'
    return { ok: false, error: message }
  }
}

export async function applyQuickOrderAction(
  text: string,
  mode: 'paste' | 'csv',
  idempotencyKey: string,
): Promise<QuickOrderActionResult<QuickOrderApplyResult>> {
  try {
    const { user, companyId } = await requireApprovedVendor()
    const lines = parseInput(text, mode)
    const commerce = await getCommerce({ user })
    const result = await commerce.applyQuickOrder(companyId, lines, idempotencyKey)
    revalidatePath('/cart')
    revalidatePath('/quick-order')
    return { ok: true, data: result }
  } catch (err) {
    const message =
      err instanceof QuickOrderParseError ? err.message : err instanceof Error ? err.message : 'Could not add to cart.'
    return { ok: false, error: message }
  }
}
