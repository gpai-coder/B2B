'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import { ProductCard } from '@/components/catalog/ProductCard'
import type { CatalogProductDTO, PriceDTO } from '@/lib/catalog/types'
import { CATALOG_PAGE_SIZE } from '@/lib/catalog/types'

type Facets = {
  categories: Array<{ value: string; label: string; count: number }>
  finishes: Array<{ value: string; count: number }>
}

type Props = {
  query: string
  products: CatalogProductDTO[]
  prices: Record<string, PriceDTO>
  total: number
  facets: Facets
  category?: string
  finish?: string
  minPrice?: number
  maxPrice?: number
  sort: string
  page: number
}

export function SearchPageClient({
  query,
  products,
  prices,
  total,
  facets,
  category,
  finish,
  minPrice,
  maxPrice,
  sort,
  page,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const push = useCallback(
    (next: Record<string, string | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString())
      sp.set('q', query)
      for (const [key, value] of Object.entries(next)) {
        if (value == null || value === '') sp.delete(key)
        else sp.set(key, value)
      }
      if (!next.page) sp.delete('page')
      router.push(`/search?${sp.toString()}`)
    },
    [query, router, searchParams],
  )

  const visible = useMemo(() => products, [products])

  return (
    <div className="as-plp as-search-page" data-testid="search-page">
      <div className="as-plp__header">
        <h1 className="as-plp__title">Search results</h1>
        <p className="as-plp__count">
          {total} result{total === 1 ? '' : 's'} for &ldquo;{query}&rdquo;
        </p>
      </div>

      <div className="as-plp__layout">
        <aside className="as-filters as-search-page__filters">
          <div className="as-filters__head">
            <span className="as-filters__title">Filters</span>
          </div>
          <div className="as-facet">
            <p className="as-facet__title">Category</p>
            <ul className="as-facet__list">
              {facets.categories.map((c) => (
                <li key={c.value}>
                  <label>
                    <input
                      type="radio"
                      name="category"
                      checked={category === c.value}
                      onChange={() => push({ category: c.value, page: undefined })}
                    />
                    {c.label} ({c.count})
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="as-facet">
            <p className="as-facet__title">Finish</p>
            <ul className="as-facet__list">
              {facets.finishes.slice(0, 12).map((f) => (
                <li key={f.value}>
                  <label>
                    <input
                      type="checkbox"
                      checked={finish === f.value}
                      onChange={() =>
                        push({ finish: finish === f.value ? undefined : f.value, page: undefined })
                      }
                    />
                    {f.value} ({f.count})
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="as-facet">
            <p className="as-facet__title">Price range</p>
            <div className="as-search-page__price">
              <input
                type="number"
                min={0}
                placeholder="Min"
                defaultValue={minPrice ?? ''}
                data-testid="search-min-price"
                onBlur={(e) => {
                  const v = e.target.value
                  push({ minPrice: v || undefined, page: undefined })
                }}
              />
              <span>–</span>
              <input
                type="number"
                min={0}
                placeholder="Max"
                defaultValue={maxPrice ?? ''}
                data-testid="search-max-price"
                onBlur={(e) => {
                  const v = e.target.value
                  push({ maxPrice: v || undefined, page: undefined })
                }}
              />
            </div>
          </div>
        </aside>

        <div className="as-plp__main">
          <div className="as-plp__toolbar">
            <label>
              Sort{' '}
              <select
                value={sort}
                data-testid="search-sort"
                onChange={(e) => push({ sort: e.target.value, page: undefined })}
              >
                <option value="relevance">Relevance</option>
                <option value="name">Name</option>
                <option value="price-asc">Price (Low to High)</option>
                <option value="price-desc">Price (High to Low)</option>
              </select>
            </label>
            <Link href="/catalog" className="as-plp__link">
              Browse full catalog
            </Link>
          </div>

          {visible.length === 0 ? (
            <div className="as-search-page__empty" data-testid="search-empty">
              <p>No products matched your search.</p>
              <p>Try a model number, SKU, or product name.</p>
            </div>
          ) : (
            <ul className="as-plp__grid">
              {visible.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} prices={prices} />
                </li>
              ))}
            </ul>
          )}

          {total > page * CATALOG_PAGE_SIZE ? (
            <button
              type="button"
              className="as-plp__load-more"
              data-testid="search-load-more"
              onClick={() => push({ page: String(page + 1) })}
            >
              Load more
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
