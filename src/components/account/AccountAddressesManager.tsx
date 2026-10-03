'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  createShipToAddressAction,
  deleteShipToAddressAction,
  setDefaultShipToAddressAction,
  updateShipToAddressAction,
} from '@/app/(frontend)/account/actions'
import type { ShipToAddressRecord } from '@/lib/vendor/ship-to-addresses'

type Props = {
  initialAddresses: ShipToAddressRecord[]
}

export function AccountAddressesManager({ initialAddresses }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'Request failed.')
      return
    }
    router.refresh()
  }

  return (
    <div data-testid="account-addresses-manager">
      {initialAddresses.length === 0 ? (
        <p data-testid="account-addresses-empty">No saved addresses yet.</p>
      ) : (
        <ul className="as-address-list">
          {initialAddresses.map((address) => (
            <li key={address.id} data-testid={`account-address-${address.id}`}>
              <strong>{address.label}</strong>
              {address.isDefault ? (
                <span data-testid={`account-address-default-${address.id}`}> (default)</span>
              ) : null}
              <div>
                {address.shipTo.name}, {address.shipTo.line1}, {address.shipTo.city},{' '}
                {address.shipTo.state} {address.shipTo.postalCode}
              </div>
              {!address.isDefault ? (
                <button
                  type="button"
                  disabled={busy}
                  data-testid={`account-address-set-default-${address.id}`}
                  onClick={() => void run(() => setDefaultShipToAddressAction(address.id))}
                >
                  Make default
                </button>
              ) : null}
              <form
                className="as-address-edit"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(() => updateShipToAddressAction(address.id, new FormData(event.currentTarget)))
                }}
              >
                <input name="label" defaultValue={address.label} required data-testid={`address-label-${address.id}`} />
                <input name="name" defaultValue={address.shipTo.name} required />
                <input name="line1" defaultValue={address.shipTo.line1} required />
                <input name="line2" defaultValue={address.shipTo.line2 ?? ''} />
                <input name="city" defaultValue={address.shipTo.city} required />
                <input name="state" defaultValue={address.shipTo.state} required />
                <input name="postalCode" defaultValue={address.shipTo.postalCode} required />
                <input name="country" defaultValue={address.shipTo.country ?? 'US'} />
                <button type="submit" disabled={busy} data-testid={`address-save-${address.id}`}>
                  Save
                </button>
              </form>
              <button
                type="button"
                disabled={busy}
                data-testid={`account-address-delete-${address.id}`}
                onClick={() => void run(() => deleteShipToAddressAction(address.id))}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>Add address</h2>
      <form
        className="as-address-create"
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            const result = await createShipToAddressAction(new FormData(event.currentTarget))
            if (result.ok) event.currentTarget.reset()
            return result
          })
        }}
      >
        <label>
          Label *
          <input name="label" required data-testid="account-address-new-label" />
        </label>
        <label>
          Name *
          <input name="name" required data-testid="account-address-new-name" />
        </label>
        <label>
          Address *
          <input name="line1" required />
        </label>
        <label>
          Line 2
          <input name="line2" />
        </label>
        <label>
          City *
          <input name="city" required />
        </label>
        <label>
          State *
          <input name="state" required />
        </label>
        <label>
          Postal code *
          <input name="postalCode" required />
        </label>
        <label>
          Country
          <input name="country" defaultValue="US" />
        </label>
        <button type="submit" disabled={busy} data-testid="account-address-create">
          Add address
        </button>
      </form>

      {error ? (
        <p className="error" data-testid="account-addresses-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
