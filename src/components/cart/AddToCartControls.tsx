'use client'

import { useState, useTransition } from 'react'

import { addToCartAction, setCartLineAction } from '@/app/(frontend)/cart/actions'
import { parseCartQuantity, quantityHint, validateOrderQuantity } from '@/lib/cart/quantity-rules'

type Props = {
  sku: string
  moq: number
  orderMultiple: number
  compact?: boolean
  initialQuantity?: number
  mode?: 'add' | 'set'
}

export function AddToCartControls({
  sku,
  moq,
  orderMultiple,
  compact = false,
  initialQuantity = 1,
  mode = 'add',
}: Props) {
  const [quantity, setQuantity] = useState(initialQuantity)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const hint = quantityHint({ moq, orderMultiple })

  const onSubmit = () => {
    const parsed = parseCartQuantity(quantity)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const validation = validateOrderQuantity(parsed.quantity, { moq, orderMultiple })
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    startTransition(async () => {
      const result =
        mode === 'set'
          ? await setCartLineAction(sku, parsed.quantity)
          : await addToCartAction(sku, parsed.quantity)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className={compact ? 'as-card__cart' : 'as-pdp__cart-controls'} data-testid={`add-to-cart-${sku}`}>
      <div className="as-pdp__cta-row">
        <input
          type="number"
          min={1}
          max={9999}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 1)}
          className="as-qty"
          aria-label="Quantity"
          data-testid={`cart-qty-${sku}`}
        />
        <button
          type="button"
          className="as-btn-primary"
          disabled={pending}
          data-testid={`cart-add-${sku}`}
          onClick={onSubmit}
        >
          {mode === 'set' ? 'Update' : 'Add to cart'}
        </button>
      </div>
      {hint ? <p className="as-qty-hint">{hint}</p> : null}
      {error ? (
        <p className="as-field-error" role="alert" data-testid={`cart-error-${sku}`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
