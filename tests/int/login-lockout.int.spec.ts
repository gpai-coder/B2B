// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'
import { APIError, formatErrors } from 'payload'

function loginMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

describe('login brute-force protection', () => {
  let payload: Payload
  let staffUserId: number
  let enumUserId: number
  let lockUserId: number
  const enumEmail = `lockout-enum-${Date.now()}@local.test`
  const lockEmail = `lockout-lock-${Date.now()}@local.test`
  const tempPassword = 'TempLockoutPassword1!'

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return
    payload = await getPayload({ config: await config })
    const staff = await payload.find({
      collection: 'users',
      where: { email: { equals: process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test' } },
      limit: 1,
      overrideAccess: true,
    })
    staffUserId = staff.docs[0]!.id

    const createdEnum = await payload.create({
      collection: 'users',
      data: {
        email: enumEmail,
        password: tempPassword,
        role: 'sales',
      },
      overrideAccess: true,
    })
    enumUserId = createdEnum.id

    const createdLock = await payload.create({
      collection: 'users',
      data: {
        email: lockEmail,
        password: tempPassword,
        role: 'sales',
      },
      overrideAccess: true,
    })
    lockUserId = createdLock.id
  })

  afterAll(async () => {
    if (!payload) return
    for (const id of [enumUserId, lockUserId]) {
      if (id) {
        await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => {})
      }
    }
    await payload.destroy()
  })

  it('returns the same auth failure for unknown email and wrong password', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    let unknownMsg = ''
    let wrongPassMsg = ''
    try {
      await payload.login({
        collection: 'users',
        data: { email: `missing-${Date.now()}@local.test`, password: 'wrong-password-xyz' },
      })
    } catch (err) {
      unknownMsg = loginMessage(err)
    }
    try {
      await payload.login({
        collection: 'users',
        data: { email: enumEmail, password: 'wrong-password-xyz' },
      })
    } catch (err) {
      wrongPassMsg = loginMessage(err)
    }
    expect(unknownMsg.length).toBeGreaterThan(0)
    expect(wrongPassMsg.length).toBeGreaterThan(0)
    expect(unknownMsg).toBe(wrongPassMsg)
  })

  it('locks the account after maxLoginAttempts and staff can unlock', async () => {
    if (!process.env.DATABASE_URL || !payload) return

    for (let i = 0; i < 5; i++) {
      await expect(
        payload.login({
          collection: 'users',
          data: { email: lockEmail, password: 'not-the-password' },
        }),
      ).rejects.toThrow()
    }

    await expect(
      payload.login({
        collection: 'users',
        data: { email: lockEmail, password: tempPassword },
      }),
    ).rejects.toThrow()

    const staff = await payload.findByID({ collection: 'users', id: staffUserId, overrideAccess: true })
    const staffReq = createPayloadReq(payload, staff)
    await payload.update({
      collection: 'users',
      id: lockUserId,
      data: { loginAttempts: 0, lockUntil: null },
      req: staffReq,
      overrideAccess: true,
    })

    const session = await payload.login({
      collection: 'users',
      data: { email: lockEmail, password: tempPassword },
    })
    expect(session.user?.email).toBe(lockEmail)
  })

  it('formats public API errors without stack traces', async () => {
    const cfg = await config
    expect(cfg.debug).not.toBe(true)
    const body = formatErrors(new APIError('Invalid email or password.', 401, null, true))
    expect(Object.prototype.hasOwnProperty.call(body, 'stack')).toBe(false)
    expect(JSON.stringify(body)).not.toMatch(/\.ts:\d+:\d+/)
  })
})
