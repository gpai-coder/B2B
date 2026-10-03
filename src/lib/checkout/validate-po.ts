export type PoValidationResult = { ok: true; poNumber: string } | { ok: false; error: string }

export function validatePoNumber(raw: string | null | undefined): PoValidationResult {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return { ok: false, error: 'PO number is required.' }
  }
  if (trimmed.length > 35) {
    return { ok: false, error: 'PO number must be at most 35 characters.' }
  }
  return { ok: true, poNumber: trimmed }
}
