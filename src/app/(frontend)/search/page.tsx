import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { SearchPageClient } from '@/components/catalog/SearchPageClient'
import { loadSearchPageData } from '@/lib/search/load-search-page-data'
import { parseSearchRequestParams } from '@/lib/search/validate'
import { getCompanyIdFromUser, getRequestUser } from '@/lib/session'
import { vendorPortalApprovalGate, VENDOR_PENDING_ACCOUNT_PATH } from '@/lib/vendor-portal'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SearchPage({ searchParams }: PageProps) {
  const user = await getRequestUser()
  if (!user || user.role !== 'vendor-buyer') {
    const raw = await searchParams
    const q = typeof raw.q === 'string' ? raw.q : ''
    redirect(`/login?next=${encodeURIComponent(q ? `/search?q=${encodeURIComponent(q)}` : '/search')}`)
  }
  const companyId = getCompanyIdFromUser(user)
  if (!companyId) {
    return <p className="error">Vendor account is missing a company.</p>
  }

  const approval = vendorPortalApprovalGate(user)
  if (!approval.ok) {
    redirect(VENDOR_PENDING_ACCOUNT_PATH)
  }

  const raw = await searchParams
  const params = parseSearchRequestParams(
    new URLSearchParams(
      Object.entries(raw).flatMap(([key, value]) => {
        if (value == null) return [] as [string, string][]
        if (Array.isArray(value)) return value.map((v) => [key, v] as [string, string])
        return [[key, value] as [string, string]]
      }),
    ),
  )

  const loaded = await loadSearchPageData(user, companyId, params)
  if (loaded === 'empty-query') {
    return (
      <div className="as-search-page__empty" data-testid="search-empty">
        <h1>Search catalog</h1>
        <p>Enter a model number, SKU, or product name in the header search box.</p>
      </div>
    )
  }

  return (
    <Suspense fallback={<p>Loading search…</p>}>
      <SearchPageClient
        query={loaded.query}
        products={loaded.products}
        prices={loaded.prices}
        total={loaded.total}
        facets={loaded.facets}
        category={loaded.params.category}
        finish={loaded.params.finish}
        minPrice={loaded.params.minPrice}
        maxPrice={loaded.params.maxPrice}
        sort={loaded.params.sort}
        page={loaded.params.page}
      />
    </Suspense>
  )
}

export const metadata = {
  title: 'Search | B2B Portal',
}
