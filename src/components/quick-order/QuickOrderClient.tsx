'use client'

import { useMemo, useState, useTransition } from 'react'

import { QUICK_ORDER_MAX_BYTES } from '@/lib/quick-order/limits'
import {
  applyQuickOrderAction,
  previewQuickOrderAction,
} from '@/app/(frontend)/quick-order/actions'
import type { QuickOrderPreview } from '@/commerce/types'

type Props = {
  initialPreview?: QuickOrderPreview | null
}

export function QuickOrderClient(_props: Props) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'paste' | 'csv'>('paste')
  const [preview, setPreview] = useState<QuickOrderPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applyMessage, setApplyMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  const validCount = preview?.lines.filter((l) => l.ok).length ?? 0

  const onValidate = () => {
    setError(null)
    setApplyMessage(null)
    startTransition(async () => {
      const result = await previewQuickOrderAction(text, mode)
      if (!result.ok) {
        setPreview(null)
        setError(result.error)
        return
      }
      setPreview(result.data)
    })
  }

  const onApply = () => {
    setError(null)
    setApplyMessage(null)
    startTransition(async () => {
      const result = await applyQuickOrderAction(text, mode, idempotencyKey)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setApplyMessage(
        result.data.replay
          ? 'Already applied (idempotent replay). Cart was not changed again.'
          : `Added ${result.data.addedSkus.length} SKU(s) to your cart.`,
      )
    })
  }

  return (
    <div className="as-quick-order" data-testid="quick-order-page">
      <h1 className="as-plp__title">Quick order</h1>
      <p>Paste SKU and quantity lines, or upload a CSV (sku,qty). Maximum 500 lines.</p>

      <label className="as-quick-order__upload">
        Upload CSV
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          data-testid="quick-order-file"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (file.size > QUICK_ORDER_MAX_BYTES) {
              setError(`File exceeds ${QUICK_ORDER_MAX_BYTES} bytes.`)
              return
            }
            setMode('csv')
            setText(await file.text())
            setPreview(null)
            setError(null)
          }}
        />
      </label>

      <div className="as-quick-order__mode">
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'paste'}
            onChange={() => setMode('paste')}
          />{' '}
          Paste lines
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === 'csv'} onChange={() => setMode('csv')} /> CSV text
        </label>
      </div>

      <textarea
        className="as-quick-order__input"
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'7353101.002 2\n2034314.020 6'}
        data-testid="quick-order-input"
      />

      <div className="as-quick-order__actions">
        <button type="button" className="as-btn-secondary" disabled={pending} onClick={onValidate}>
          Validate
        </button>
        <button
          type="button"
          className="as-btn-primary"
          disabled={pending || validCount === 0}
          data-testid="quick-order-apply"
          onClick={onApply}
        >
          Add valid lines to cart
        </button>
      </div>

      {error ? (
        <p className="as-field-error" role="alert" data-testid="quick-order-error">
          {error}
        </p>
      ) : null}
      {applyMessage ? <p data-testid="quick-order-apply-message">{applyMessage}</p> : null}

      {preview ? (
        <table className="as-cart-table" data-testid="quick-order-preview">
          <thead>
            <tr>
              <th>Line</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Product</th>
              <th>Unit price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => (
              <tr key={`${line.lineNumber}-${line.sku}`} data-testid={`quick-order-line-${line.sku}`}>
                <td>{line.lineNumber}</td>
                <td>{line.sku}</td>
                <td>{line.quantity}</td>
                <td>{line.productName ?? '—'}</td>
                <td>
                  {line.unitPrice ? `$${line.unitPrice.amount.toFixed(2)} (${line.source})` : '—'}
                </td>
                <td>{line.ok ? 'OK' : line.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
