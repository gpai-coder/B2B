export type QuantityRuleInput = {
  moq: number
  orderMultiple: number
}

export function normalizeQuantityRules(input: Partial<QuantityRuleInput>): QuantityRuleInput {
  const moq = Math.max(1, Math.floor(input.moq ?? 1))
  const orderMultiple = Math.max(1, Math.floor(input.orderMultiple ?? 1))
  return { moq, orderMultiple }
}

/** Returns a user-facing error message, or null when valid. */
export function validateOrderQuantity(quantity: number, rules: QuantityRuleInput): string | null {
  const q = Math.floor(quantity)
  if (!Number.isFinite(quantity) || q < 1) {
    return 'Quantity must be at least 1.'
  }
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
