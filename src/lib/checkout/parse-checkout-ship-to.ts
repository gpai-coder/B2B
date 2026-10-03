import type { ShipToFields } from '@/lib/checkout/ship-to'

export type ParsedCheckoutShipTo =
  | { ok: true; shipTo: ShipToFields }
  | { ok: false; error: string }

/** Shared with checkout server action — manual ship-to when the saved address book is empty. */
export function parseCheckoutShipToFromForm(formData: FormData): ParsedCheckoutShipTo {
  const shipTo: ShipToFields = {
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
  return { ok: true, shipTo }
}
