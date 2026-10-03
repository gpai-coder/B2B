export type QuantityRuleInput = {
  moq: number
  orderMultiple: number
}

export const MAX_CART_QUANTITY = 9999

export type ParseCartQuantityResult =
  | { ok: true; quantity: number }
  | { ok: false; error: string }

/** Validates a cart quantity is a positive integer within bounds. */
export function parseCartQuantity(raw: number): ParseCartQuantityResult {
  if (!Number.isFinite(raw)) {
    return { ok: false, error: 'Quantity must be a whole number.' }
  }
  if (!Number.isInteger(raw)) {
    return { ok: false, error: 'Quantity must be a whole number.' }
  }
  if (raw < 1) {
    return { ok: false, error: 'Quantity must be at least 1.' }
  }
  if (raw > MAX_CART_QUANTITY) {
    return { ok: false, error: `Maximum quantity is ${MAX_CART_QUANTITY}.` }
  }
  return { ok: true, quantity: raw }
}

export function normalizeQuantityRules(input: Partial<QuantityRuleInput>): QuantityRuleInput {
  const moq = Math.max(1, Math.floor(input.moq ?? 1))
  const orderMultiple = Math.max(1, Math.floor(input.orderMultiple ?? 1))
  return { moq, orderMultiple }
}

/** Returns a user-facing error message, or null when valid. */
export function validateOrderQuantity(quantity: number, rules: QuantityRuleInput): string | null {
  const parsed = parseCartQuantity(quantity)
  if (!parsed.ok) return parsed.error
  const q = parsed.quantity
  if (q < rules.moq) {
    return `Minimum order quantity is ${rules.moq}.`
  }
  if (q % rules.orderMultiple !== 0) {
    return `Order in multiples of ${rules.orderMultiple}.`
  }
  return null
}

export function quantityHint(rules: QuantityRuleInput): string | null {
  const parts: string[] = []
  if (rules.moq > 1) parts.push(`MOQ ${rules.moq}`)
  if (rules.orderMultiple > 1) parts.push(`case pack ×${rules.orderMultiple}`)
  return parts.length ? parts.join(' · ') : null
}
