import type { Payload, PayloadRequest } from 'payload'

export async function withPayloadTransaction<T>(
  payload: Payload,
  req: PayloadRequest,
  fn: () => Promise<T>,
): Promise<T> {
  const ownsTx = req.transactionID == null
  const previousTransactionId = req.transactionID
  let ownedTransactionId: string | number | null | undefined
  if (ownsTx) {
    ownedTransactionId = await payload.db.beginTransaction()
    if (ownedTransactionId != null) req.transactionID = ownedTransactionId
  }
  try {
    const result = await fn()
    if (ownsTx && ownedTransactionId != null) {
      await payload.db.commitTransaction(ownedTransactionId)
    }
    return result
  } catch (err) {
    if (ownsTx && ownedTransactionId != null) {
      await payload.db.rollbackTransaction(ownedTransactionId)
    }
    throw err
  } finally {
    if (ownsTx) req.transactionID = previousTransactionId
  }
}
