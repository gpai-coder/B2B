import { redirect } from 'next/navigation'

import { getRequestUser } from '@/lib/session'

import { createAndSubmitQuoteOrder } from './actions'

type Props = { params: Promise<{ quoteNumber: string }> }

export default async function QuoteOrderPage({ params }: Props) {
  const { quoteNumber } = await params
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect(`/login?next=/quotes/${encodeURIComponent(quoteNumber)}/order`)
  }

  async function submit() {
    'use server'
    await createAndSubmitQuoteOrder(quoteNumber)
  }

  return (
    <div className="quote-order">
      <h1>Order from {quoteNumber}</h1>
      <p>Creates a draft order from your seeded quote lines and submits it.</p>
      <form action={submit}>
        <button type="submit" data-testid="submit-quote-order">
          Create draft order and submit
        </button>
      </form>
    </div>
  )
}
