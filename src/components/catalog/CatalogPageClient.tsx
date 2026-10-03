'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import {
  buildFacetCounts,
  filterAndSortCatalog,
  parseCatalogSearchParams,
  serializeCatalogParams,
} from '@/lib/catalog/catalog-utils'
import type { CatalogProductDTO, CatalogSearchParams, PriceDTO } from '@/lib/catalog/types'
import { CATALOG_PAGE_SIZE, SORT_OPTIONS } from '@/lib/catalog/types'

import { ProductCard } from './ProductCard'

type Props = {
  products: CatalogProductDTO[]
  prices: Record<string, PriceDTO>
}

function toggleValue(list: string[] | undefined, value: string): string[] {
  const set = new Set(list ?? [])
  if (set.has(value)) set.delete(value)
  else set.add(value)
  return [...set]
}

export function CatalogPageClient({ products, prices }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = parseCatalogSearchParams({
    finish: searchParams.getAll('finish'),
    collection: searchParams.getAll('collection'),
    handleType: searchParams.getAll('handleType'),
    holes: searchParams.getAll('holes'),
    ada: searchParams.getAll('ada'),
    inStock: searchParams.get('inStock') ?? undefined,
    showDiscontinued: searchParams.get('showDiscontinued') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    page: searchParams.get('page') ?? undefined,
  })
  const priceMap = useMemo(() => new Map(Object.entries(prices)), [prices])

  const filtered = useMemo(
    () => filterAndSortCatalog(products, params, priceMap),
    [products, params, priceMap],
  )

  const facets = useMemo(() => buildFacetCounts(products), [products])
  const page = params.page ?? 1
  const visibleCount = page * CATALOG_PAGE_SIZE
  const visible = filtered.slice(0, visibleCount)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    finish: true,
    collection: false,
    handleType: false,
    holes: false,
    ada: false,
  })

  const pushParams = useCallback(
    (next: CatalogSearchParams) => {
      const sp = serializeCatalogParams({ ...next, page: 1 })
      router.push(sp.toString() ? `/catalog?${sp.toString()}` : '/catalog')
    },
    [router],
  )

  const chips = [
    ...(params.finish ?? []).map((f) => ({ key: 'finish', label: `Finish: ${f}`, value: f })),
    ...(params.collection ?? []).map((c) => ({
      key: 'collection',
      label: `Collection: ${c}`,
      value: c,
    })),
  ]

  const filterPanel = (
    <div className="as-filters">
      <div className="as-filters__head">
        <span className="as-filters__title">Filters</span>
      </div>
      <label className="as-filters__toggle">
        <input
          type="checkbox"
          checked={params.showDiscontinued ?? false}
          onChange={(e) =>
            pushParams({ ...params, showDiscontinued: e.target.checked || undefined })
          }
        />
        Show discontinued products
      </label>
      <label className="as-filters__toggle">
        <input
          type="checkbox"
          checked={params.inStock ?? false}
          onChange={(e) => pushParams({ ...params, inStock: e.target.checked || undefined })}
          data-testid="filter-in-stock"
        />
        In stock
      </label>

      {(
        [
          ['finish', 'Color', facets.finish],
          ['collection', 'Design Collection', facets.collection],
          ['handleType', 'Handle Type', facets.handleType],
          ['holes', 'Number of Holes Required', facets.holes],
          ['ada', 'ADA', facets.ada],
        ] as const
      ).map(([key, title, map]) => {
        if (map.size === 0) return null
        const open = openSections[key]
        return (
          <div key={key} className="as-facet">
            <button
              type="button"
              className="as-facet__head"
              onClick={() => setOpenSections((s) => ({ ...s, [key]: !s[key] }))}
            >
              <span>{title}</span>
              <span className="as-facet__icon">{open ? '−' : '+'}</span>
            </button>
            {open ? (
              <ul className="as-facet__list">
                {[...map.entries()]
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([value, count]) => {
                    const selected =
                      key === 'finish'
                        ? params.finish?.includes(value)
                        : key === 'collection'
                          ? params.collection?.includes(value)
                          : key === 'handleType'
                            ? params.handleType?.includes(value)
                            : key === 'holes'
                              ? params.holes?.includes(value)
                              : params.ada?.includes(value)
                    return (
                      <li key={value}>
                        <label className="as-facet__option">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            data-testid={`filter-${key}-${value.replace(/\s+/g, '-')}`}
                            onChange={() => {
                              if (key === 'finish') {
                                pushParams({
                                  ...params,
                                  finish: toggleValue(params.finish, value),
                                })
                              } else if (key === 'collection') {
                                pushParams({
                                  ...params,
                                  collection: toggleValue(params.collection, value),
                                })
                              } else if (key === 'handleType') {
                                pushParams({
                                  ...params,
                                  handleType: toggleValue(params.handleType, value),
                                })
                              } else if (key === 'holes') {
                                pushParams({
                                  ...params,
                                  holes: toggleValue(params.holes, value),
                                })
                              } else {
                                pushParams({
                                  ...params,
                                  ada: toggleValue(params.ada, value),
                                })
                              }
                            }}
                          />
                          <span>
                            {value} ({count})
                          </span>
                        </label>
                      </li>
                    )
                  })}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="as-plp" data-testid="catalog-page">
      <nav className="as-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span> / </span>
        <span>Catalog</span>
      </nav>
      <h1 className="as-plp__title">American Standard product catalog</h1>
      <p className="as-plp__intro">
        Contract pricing for approved distributors. Select finishes on each card to preview SKU and
        price.
      </p>

      {chips.length > 0 ? (
        <div className="as-chips">
          {chips.map((chip) => (
            <button
              key={`${chip.key}-${chip.value}`}
              type="button"
              className="as-chip"
              onClick={() => {
                if (chip.key === 'finish') {
                  pushParams({
                    ...params,
                    finish: params.finish?.filter((f) => f !== chip.value),
                  })
                } else {
                  pushParams({
                    ...params,
                    collection: params.collection?.filter((c) => c !== chip.value),
                  })
                }
              }}
            >
              {chip.label} ×
            </button>
          ))}
          <button type="button" className="as-clear-filters" onClick={() => router.push('/catalog')}>
            CLEAR FILTERS
          </button>
        </div>
      ) : null}

      <div className="as-plp__toolbar">
        <button
          type="button"
          className="as-refine-mobile"
          onClick={() => setMobileOpen(true)}
        >
          REFINE FILTERS
        </button>
        <p className="as-plp__count" data-testid="catalog-result-count">
          {filtered.length} products
        </p>
        <label className="as-plp__sort">
          Sort by:
          <select
            value={params.sort ?? 'relevance'}
            onChange={(e) => pushParams({ ...params, sort: e.target.value })}
            data-testid="catalog-sort"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="as-plp__layout">
        <aside className="as-plp__sidebar">{filterPanel}</aside>
        <div className="as-plp__main">
          <ul className="as-plp__grid">
            {visible.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} prices={prices} />
              </li>
            ))}
          </ul>
          {visibleCount < filtered.length ? (
            <div className="as-load-more">
              <p>
                You&apos;ve viewed {visible.length} of {filtered.length} products
              </p>
              <button
                type="button"
                className="as-btn-secondary"
                data-testid="catalog-load-more"
                onClick={() => {
                  const sp = serializeCatalogParams({ ...params, page: page + 1 })
                  router.push(`/catalog?${sp.toString()}`)
                }}
              >
                Load More
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {mobileOpen ? (
        <div className="as-drawer" role="dialog" aria-modal="true">
          <div className="as-drawer__panel">
            <button type="button" className="as-drawer__close" onClick={() => setMobileOpen(false)}>
              ×
            </button>
            {filterPanel}
            <button type="button" className="as-btn-primary as-drawer__apply" onClick={() => setMobileOpen(false)}>
              Show {filtered.length} products
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
