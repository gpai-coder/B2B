'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { finishSwatchColor } from '@/lib/finish-swatches'
import { vendorMediaPath } from '@/lib/product-media'

import type { CatalogProductDTO, PriceDTO } from '@/lib/catalog/types'

type Props = {
  product: CatalogProductDTO
  prices: Record<string, PriceDTO | undefined>
}

export function ProductCard({ product, prices }: Props) {
  const defaultVariant =
    product.variants.find((v) => v.inStock && !v.discontinued) ?? product.variants[0]!
  const [activeSku, setActiveSku] = useState(defaultVariant.sku)

  const activeVariant = product.variants.find((v) => v.sku === activeSku) ?? defaultVariant
  const price = prices[activeSku]
  const imageId =
    activeVariant.imageMediaIds[0] ?? product.primaryImageId ?? activeVariant.imageMediaIds[0]

  const listPrice = activeVariant.msrp

  return (
    <article className="as-card" data-testid={`catalog-card-${product.slug}`}>
      <Link href={`/products/${product.slug}?sku=${encodeURIComponent(activeSku)}`} className="as-card__link">
        <div className="as-card__image-panel">
          {imageId ? (
            <img
              src={vendorMediaPath(imageId)}
              alt={product.name}
              className="as-card__image"
              data-testid={`catalog-card-image-${product.slug}`}
            />
          ) : (
            <img src="/images/product-fallback.svg" alt="" className="as-card__image" />
          )}
        </div>
        <div className="as-card__swatches" onClick={(e) => e.preventDefault()}>
          {product.variants.map((v) => (
            <button
              key={v.sku}
              type="button"
              className={`as-swatch${v.sku === activeSku ? ' as-swatch--active' : ''}${v.discontinued || !v.inStock ? ' as-swatch--unavailable' : ''}`}
              style={{ backgroundColor: finishSwatchColor(v.finish) }}
              title={v.finish}
              aria-label={v.finish}
              data-testid={`catalog-finish-${product.slug}-${v.finish.replace(/\s+/g, '-')}`}
              onClick={() => setActiveSku(v.sku)}
            />
          ))}
        </div>
        <h2 className="as-card__title">{product.name}</h2>
        {product.modelNumber ? (
          <p className="as-card__model">MODEL: {product.modelNumber}</p>
        ) : null}
        <div className="as-card__price-row">
          {price ? (
            <>
              <span className="as-card__your-price" data-testid={`catalog-price-${activeSku}`}>
                ${price.unitPrice.amount.toFixed(2)}
              </span>
              {listPrice && listPrice > price.unitPrice.amount ? (
                <span className="as-card__list-price">${listPrice.toFixed(2)}</span>
              ) : null}
            </>
          ) : (
            <span className="as-card__sign-in">Sign in for pricing</span>
          )}
        </div>
      </Link>
    </article>
  )
}

export function useVisibleProducts(
  products: CatalogProductDTO[],
  visibleCount: number,
) {
  return useMemo(() => products.slice(0, visibleCount), [products, visibleCount])
}
