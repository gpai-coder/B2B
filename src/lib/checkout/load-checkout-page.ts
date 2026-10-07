import { getCommerce } from '@/commerce'
import type { CartSummary } from '@/commerce/types'
import { getAppPayload } from '@/lib/payload/get-app-payload'
import { loadDefaultShipToForCheckout } from '@/lib/vendor/ship-to-addresses'
import type { User } from '@/payload-types'

export async function loadCheckoutPageData(
  user: User,
  companyId: string,
): Promise<{
  summary: CartSummary
  defaultShipTo: Awaited<ReturnType<typeof loadDefaultShipToForCheckout>>['defaultShipTo']
  savedAddresses: Awaited<ReturnType<typeof loadDefaultShipToForCheckout>>['savedAddresses']
}> {
  const commerce = await getCommerce({ user })
  const summary = await commerce.getCartSummary(companyId)
  const payload = await getAppPayload()
  const { defaultShipTo, savedAddresses } = await loadDefaultShipToForCheckout(payload, user, companyId)
  return { summary, defaultShipTo, savedAddresses }
}
