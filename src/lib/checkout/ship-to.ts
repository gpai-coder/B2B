import type { CheckoutInput } from '@/commerce/types'

export type ShipToFields = CheckoutInput['shipTo']

export function shipToFromCompanyDefault(
  defaultShipTo: {
    name?: string | null
    line1?: string | null
    line2?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
    country?: string | null
  } | null | undefined,
): ShipToFields | null {
  if (!defaultShipTo?.name || !defaultShipTo.line1 || !defaultShipTo.city || !defaultShipTo.state) {
    return null
  }
  if (!defaultShipTo.postalCode) return null
  return {
    name: defaultShipTo.name,
    line1: defaultShipTo.line1,
    line2: defaultShipTo.line2 ?? undefined,
    city: defaultShipTo.city,
    state: defaultShipTo.state,
    postalCode: defaultShipTo.postalCode,
    country: defaultShipTo.country ?? 'US',
  }
}
