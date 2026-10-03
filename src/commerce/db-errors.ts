/**
 * Detect Postgres unique violations through Payload's wrapped ValidationError.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const record = err as Record<string, unknown>
  if (record.code === '23505') return true
  const cause = record.cause
  if (cause && typeof cause === 'object' && (cause as Record<string, unknown>).code === '23505') {
    return true
  }
  const data = record.data
  if (data && typeof data === 'object') {
    const errors = (data as { errors?: Array<{ message?: string }> }).errors
    if (errors?.some((e) => /unique/i.test(e.message ?? ''))) return true
  }
  if (typeof record.message === 'string' && /unique/i.test(record.message)) return true
  return false
}
