import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCommerce } from '@/commerce'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

const PENDING_APPROVAL = 'Your account is pending administrator approval.'

function orderTotal(order: { lines: Array<{ quantity: number; unitPrice: { amount: number } }> }) {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice.amount, 0)
}

export default async function OrdersPage() {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login?next=/orders')
  }
  if (!user.approved) {
    return <p className="error">{PENDING_APPROVAL}</p>
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const commerce = await getCommerce({ user })
  const orders = await commerce.listOrders(companyId)

  return (
    <div className="as-orders" data-testid="orders-page">
      <h1 className="as-plp__title">Your orders</h1>
      {orders.length === 0 ? (
        <p data-testid="orders-empty">No orders yet.</p>
      ) : (
        <table className="as-cart-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>PO</th>
              <th>Status</th>
              <th>Lines</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} data-testid={`order-row-${order.id}`}>
                <td>
                  <Link href={`/orders/${order.id}`} data-testid={`order-link-${order.id}`}>
                    {order.orderNumber ?? order.id}
                  </Link>
                </td>
                <td>{order.poNumber ?? '—'}</td>
                <td>{order.status}</td>
                <td>{order.lines.length}</td>
                <td data-testid={`order-total-${order.id}`}>${orderTotal(order).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export const metadata = {
  title: 'Orders | B2B Portal',
}
