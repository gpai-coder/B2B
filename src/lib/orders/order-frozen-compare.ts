const SHIP_TO_KEYS = ['name', 'line1', 'line2', 'city', 'state', 'postalCode', 'country'] as const

/** null, undefined and '' compare equal for frozen ship-to and text fields. */
export function emptyEquivalent(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v == null || v === '') return null
    return v
  }
  return norm(a) === norm(b)
}

export function shipToSemanticallyEqual(
  locked: Record<string, unknown> | null | undefined,
  next: unknown,
): boolean {
  if (next === null) return false
  if (next == null || typeof next !== 'object') return true
  const prev = (locked ?? {}) as Record<string, unknown>
  const data = next as Record<string, unknown>
  for (const key of SHIP_TO_KEYS) {
    if (!emptyEquivalent(prev[key], data[key])) return false
  }
  return true
}

function lineIdentity(line: Record<string, unknown>) {
  const variant = line.variant
  const variantId =
    typeof variant === 'object' && variant != null ? Number((variant as { id: number }).id) : variant
  return {
    sku: String(line.sku ?? ''),
    variant: variantId != null && !Number.isNaN(Number(variantId)) ? Number(variantId) : null,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
  }
}

export function linesSemanticallyEqual(
  locked: Array<Record<string, unknown>> | null | undefined,
  next: unknown,
): boolean {
  if (next == null) return true
  if (!Array.isArray(next)) return false
  const normalize = (rows: Array<Record<string, unknown>>) =>
    rows.map(lineIdentity).sort((a, b) => a.sku.localeCompare(b.sku) || a.quantity - b.quantity)
  return JSON.stringify(normalize(locked ?? [])) === JSON.stringify(normalize(next))
}

export function frozenTextEqual(locked: unknown, next: unknown): boolean {
  return emptyEquivalent(locked, next)
}
