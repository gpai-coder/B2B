// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  QUOTE_NOT_AVAILABLE_MESSAGE,
  quoteOrderAvailability,
} from '@/lib/quotes/quote-order-eligibility'

describe('quote order eligibility', () => {
  it('rejects non-accepted and expired quotes with a stable message', () => {
    const companyId = '42'
    const base = {
      company: 42,
      status: 'accepted',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }

    expect(quoteOrderAvailability(null, companyId)).toEqual({
      ok: false,
      message: QUOTE_NOT_AVAILABLE_MESSAGE,
    })
    expect(quoteOrderAvailability({ ...base, status: 'sent' }, companyId)).toEqual({
      ok: false,
      message: QUOTE_NOT_AVAILABLE_MESSAGE,
    })
    expect(
      quoteOrderAvailability(
        { ...base, expiresAt: new Date(Date.now() - 1000).toISOString() },
        companyId,
      ),
    ).toEqual({
      ok: false,
      message: QUOTE_NOT_AVAILABLE_MESSAGE,
    })
    expect(quoteOrderAvailability({ ...base, company: 99 }, companyId)).toEqual({
      ok: false,
      message: QUOTE_NOT_AVAILABLE_MESSAGE,
    })
    expect(quoteOrderAvailability(base, companyId)).toEqual({ ok: true })
  })
})
