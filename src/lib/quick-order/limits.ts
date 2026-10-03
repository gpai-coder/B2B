export const QUICK_ORDER_MAX_LINES = 500
export const QUICK_ORDER_MAX_BYTES = 256 * 1024

export function assertQuickOrderInputSize(raw: string): void {
  const bytes = Buffer.byteLength(raw, 'utf8')
  if (bytes > QUICK_ORDER_MAX_BYTES) {
    throw new Error(`Input exceeds ${QUICK_ORDER_MAX_BYTES} bytes.`)
  }
}
