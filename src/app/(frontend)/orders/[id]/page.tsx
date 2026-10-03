import { getCommerce } from '@/commerce'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { redirect } from 'next/navigation'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }

export default async function OrderDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { submitted } = await searchParams
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    redirect('/login')
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) return <p className="error">Missing company.</p>

  const commerce = await getCommerce({ user })
  const order = await commerce.getOrder(id, companyId)
  if (!order) return <p className="error">Order not found.</p>

  return (
    <div className="order-detail">
      {submitted ? (
        <p className="success" data-testid="order-submitted-banner">
          Order submitted successfully.
        </p>
      ) : null}
      <h1>Order {order.orderNumber ?? order.id}</h1>
      <p>Status: {order.status}</p>
      <ul>
        {order.lines.map((line) => (
          <li key={line.sku}>
            {line.sku} × {line.quantity}
          </li>
        ))}
      </ul>
    </div>
  )
}
