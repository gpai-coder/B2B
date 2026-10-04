import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { getPayload } from 'payload'

let payloadPromise: Promise<Payload> | null = null

function databaseHostname(): string | null {
  const url = process.env.DATABASE_URL
  if (!url?.trim()) return null
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/i, 'http:'))
    return parsed.hostname
  } catch {
    const match = url.match(/@([^:/]+)/)
    return match?.[1] ?? null
  }
}

function assertSafePurgeTarget(): void {
  const host = databaseHostname()
  const local =
    host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const ciAllow = process.env.CI === 'true' && process.env.ALLOW_TEST_DB_PURGE === '1'
  if (!local && !ciAllow) {
    throw new Error('purgeTestOrderById refused: database host is not local test Postgres')
  }
}

async function testPayload(): Promise<Payload> {
  assertSafePurgeTarget()
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for purge-test-order helper')
  }
  if (!payloadPromise) {
    const configModule = await import('@/payload.config')
    const config = await configModule.default
    payloadPromise = getPayload({ config })
  }
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
