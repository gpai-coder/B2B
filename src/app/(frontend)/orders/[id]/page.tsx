import { getCommerce } from '@/commerce'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPayloadReq } from '@/lib/payload-req'
import { redirect } from 'next/navigation'
import { vendorBuyerAccessDeniedMessage } from '@/lib/access/vendor-gate'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { submitted } = await searchParams
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login')
  }
  if (user.approvalStatus === 'rejected' || user.approvalStatus === 'pending' || !user.approved) {
    return <p className="error">{vendorBuyerAccessDeniedMessage(user)}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) return <p className="error">Missing company.</p>

  const commerce = await getCommerce({ user })
  const order = await commerce.getOrder(id, companyId)
  if (!order) return <p className="error">Order not found.</p>

  const payload = await getPayload({ config: await config })
  const req = createPayloadReq(payload, user)
  const events = await payload.find({
    collection: 'order-events',
    where: { order: { equals: Number(id) } },
    sort: 'createdAt',
    limit: 50,
    req,
    overrideAccess: false,
  })

  const total = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice.amount, 0)

  return (
    <div className="order-detail" data-testid="order-detail-page">
      {submitted ? (
        <p className="success" data-testid="order-submitted-banner">
          Order submitted successfully.
        </p>
      ) : null}
      <h1>Order {order.orderNumber ?? order.id}</h1>
      <p data-testid="order-status">Status: {order.status}</p>
      {order.carrier || order.trackingNumber ? (
        <p data-testid="order-tracking">
          {order.carrier ? `Carrier: ${order.carrier}` : null}
          {order.carrier && order.trackingNumber ? ' · ' : null}
          {order.trackingNumber ? `Tracking: ${order.trackingNumber}` : null}
        </p>
      ) : null}
      {order.poNumber ? (
        <p data-testid="order-po">
          PO: {order.poNumber}
        </p>
      ) : null}
      {order.orderNotes ? (
        <p data-testid="order-notes">
          Notes: {order.orderNotes}
        </p>
      ) : null}
      <table className="as-cart-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.sku}>
              <td>{line.sku}</td>
              <td>{line.quantity}</td>
              <td data-testid={`order-line-price-${line.sku}`}>${line.unitPrice.amount.toFixed(2)}</td>
              <td data-testid={`order-line-total-${line.sku}`}>
                ${(line.quantity * line.unitPrice.amount).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p data-testid="order-total">Total: ${total.toFixed(2)}</p>
      <section data-testid="order-events">
        <h2>Activity</h2>
        <ul>
          {events.docs.map((ev) => (
            <li key={ev.id} data-testid={`order-event-${ev.id}`}>
              {String(ev.fromStatus)} → {String(ev.toStatus)}
              {ev.createdAt ? ` (${new Date(String(ev.createdAt)).toLocaleString()})` : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
