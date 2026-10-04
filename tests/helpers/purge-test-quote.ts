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
    throw new Error('purgeTestQuoteById refused: database host is not local test Postgres')
  }
}

async function testPayload(): Promise<Payload> {
  assertSafePurgeTarget()
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for purge-test-quote helper')
  }
  if (!payloadPromise) {
    const configModule = await import('@/payload.config')
    const config = await configModule.default
    payloadPromise = getPayload({ config })
  }
  return payloadPromise
}

/** Test-only: remove quote row without Payload delete hooks. */
export async function purgeTestQuoteById(quoteId: number): Promise<void> {
  const payload = await testPayload()
  await payload.db.drizzle.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM "quotes_lines" WHERE "_parent_id" = ${quoteId}`)
    await tx.execute(sql`DELETE FROM "quotes" WHERE "id" = ${quoteId}`)
  })
}

/** Test-only: remove order (with events) and quote after a temp quote conversion smoke run. */
export async function purgeQuoteConversionTestData(
  quoteId: number,
  orderId: number | null | undefined,
): Promise<void> {
  const payload = await testPayload()
  await payload.db.drizzle.transaction(async (tx) => {
    if (orderId != null && !Number.isNaN(orderId)) {
      await tx.execute(sql`DELETE FROM "order_events" WHERE "order_id" = ${orderId}`)
      await tx.execute(sql`DELETE FROM "orders" WHERE "id" = ${orderId}`)
    }
    await tx.execute(sql`DELETE FROM "quotes_lines" WHERE "_parent_id" = ${quoteId}`)
    await tx.execute(sql`DELETE FROM "quotes" WHERE "id" = ${quoteId}`)
  })
}

export async function destroyTestQuotePayload(): Promise<void> {
  if (payloadPromise) {
    const payload = await payloadPromise
    await payload.destroy()
    payloadPromise = null
  }
}
