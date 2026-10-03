'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { vendorMediaPath } from '@/lib/product-media'

type Suggestion = {
  productId: number
  slug: string
  name: string
  modelNumber: string | null
  primaryImageMediaId: number | null
}

type Props = {
  initialQuery?: string
  authenticated: boolean
}

export function CatalogSearchBox({ initialQuery = '', authenticated }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQ(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    if (!authenticated) return
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&suggest=1`)
        if (!res.ok) {
          setSuggestions([])
          return
        }
        const body = (await res.json()) as { suggestions: Suggestion[] }
        setSuggestions(body.suggestions ?? [])
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [q, authenticated])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const goSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed) return
      setOpen(false)
      router.push(`/search?q=${encodeURIComponent(trimmed)}`)
    },
    [router],
  )

  return (
    <div className="as-search" ref={rootRef}>
      <form
        className="as-search__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!authenticated) {
            router.push(`/login?next=${encodeURIComponent(`/search?q=${encodeURIComponent(q.trim())}`)}`)
            return
          }
          goSearch(q)
        }}
      >
        <label className="visually-hidden" htmlFor="catalog-search">
          Search catalog
        </label>
        <input
          id="catalog-search"
          data-testid="catalog-search-input"
          className="as-search__input"
          type="search"
          placeholder="Search model #, SKU, or product name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        <button type="submit" className="as-search__submit">
          Search
        </button>
      </form>
      {authenticated && open && suggestions.length > 0 ? (
        <ul className="as-search__suggest" data-testid="catalog-search-suggest">
          {suggestions.map((s) => (
            <li key={s.productId}>
              <Link
                href={`/products/${s.slug}`}
                className="as-search__suggest-item"
                onClick={() => setOpen(false)}
              >
                <span className="as-search__thumb">
                  {s.primaryImageMediaId ? (
                    <img src={vendorMediaPath(s.primaryImageMediaId)} alt="" width={48} height={48} />
                  ) : null}
                </span>
                <span className="as-search__suggest-text">
                  <span className="as-search__suggest-name">{s.name}</span>
                  {s.modelNumber ? (
                    <span className="as-search__suggest-model">Model {s.modelNumber}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {authenticated && loading ? <p className="as-search__loading">Searching…</p> : null}
    </div>
  )
}
