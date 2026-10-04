import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { getPayload } from 'payload'

import config from '@/payload.config'

let payloadPromise: Promise<Payload> | null = null

async function testPayload(): Promise<Payload> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for purge-test-order helper')
  }
  payloadPromise ??= getPayload({ config: await config })
  return payloadPromise
}

/** Test-only: remove order history and row without Payload delete hooks. */
export async function purgeTestOrderById(orderId: number): Promise<void> {
  const payload = await testPayload()
  await payload.db.drizzle.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM "order_events" WHERE "order_id" = ${orderId}`)
    await tx.execute(sql`DELETE FROM "orders" WHERE "id" = ${orderId}`)
  })
}

export async function destroyTestPayload(): Promise<void> {
  if (payloadPromise) {
    const payload = await payloadPromise
    await payload.destroy()
    payloadPromise = null
  }
}
