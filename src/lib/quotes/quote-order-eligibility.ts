export const QUOTE_NOT_AVAILABLE_MESSAGE = 'This quote is not available for ordering.'

type QuoteLike = {
  company?: unknown
  status?: string | null
  expiresAt?: string | null
}

export function quoteOrderAvailability(
  quote: QuoteLike | null | undefined,
  companyId: string,
): { ok: true } | { ok: false; message: string } {
  if (!quote) {
    return { ok: false, message: QUOTE_NOT_AVAILABLE_MESSAGE }
  }
  const quoteCompany =
    typeof quote.company === 'object' && quote.company !== null
      ? String((quote.company as { id: number }).id)
      : String(quote.company ?? '')
  if (quoteCompany !== companyId) {
    return { ok: false, message: QUOTE_NOT_AVAILABLE_MESSAGE }
  }
  if (quote.status !== 'accepted') {
    return { ok: false, message: QUOTE_NOT_AVAILABLE_MESSAGE }
  }
  const expires = quote.expiresAt ? new Date(String(quote.expiresAt)) : null
  if (!expires || Number.isNaN(expires.getTime()) || expires.getTime() < Date.now()) {
    return { ok: false, message: QUOTE_NOT_AVAILABLE_MESSAGE }
  }
  return { ok: true }
}
