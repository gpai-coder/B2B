import type { Payload, PayloadRequest } from 'payload'

export type ResolvedUnitPrice = {
  sku: string
  unitPrice: number
  currency: string
}

type ReadOpts = { overrideAccess: boolean; req?: PayloadRequest }

export async function resolveUnitPriceForCompany(
  payload: Payload,
  companyId: number,
  variantId: number,
  sku: string,
  quantity = 1,
  readOpts: ReadOpts,
): Promise<ResolvedUnitPrice | null> {
  const result = await payload.find({
    collection: 'price-lists',
    where: {
      or: [
        { and: [{ kind: { equals: 'company' } }, { company: { equals: companyId } }] },
        { kind: { equals: 'standard' } },
      ],
    },
    limit: 10,
    ...readOpts,
  })

  const companyList = result.docs.find((l) => l.kind === 'company')
  const standardList = result.docs.find((l) => l.kind === 'standard')

  const pickFromList = (list: (typeof result.docs)[0] | undefined) => {
    if (!list?.lines) return null
    const line = list.lines.find((entry) => {
      const v = entry.variant
      const id = typeof v === 'object' ? v.id : v
      return id === variantId
    })
    if (!line) return null
    let price = line.unitPrice ?? 0
    const breaks = line.quantityBreaks ?? []
    const sortedBreaks = [...breaks].sort(
      (a, b) => (a.minQuantity ?? 0) - (b.minQuantity ?? 0),
    )
    for (const br of sortedBreaks) {
      if (quantity >= (br.minQuantity ?? 0) && br.unitPrice != null) {
        price = br.unitPrice
      }
    }
    return {
      sku,
      unitPrice: price,
      currency: line.currency ?? 'USD',
    }
  }

  return pickFromList(companyList) ?? pickFromList(standardList) ?? null
}
