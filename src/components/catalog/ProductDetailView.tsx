'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import { PRODUCT_EXTERNAL_RESOURCE_LABELS } from '@/collections/product-document-types'
import { AddToCartControls } from '@/components/cart/AddToCartControls'
import { finishSwatchColor } from '@/lib/finish-swatches'
import { pickDefaultVariantSku } from '@/lib/catalog/default-variant'
import type { PriceDTO } from '@/lib/catalog/types'
import { vendorMediaPath } from '@/lib/product-media'

export type ProductDetailDTO = {
  slug: string
  name: string
  modelNumber?: string | null
  productCollection: string
  description?: string | null
  shortBullets: string[]
  featureBullets: string[]
  specGroups: Array<{ groupName: string; rows: Array<{ label: string; value: string }> }>
  youtubeVideoId?: string | null
  documents: Array<{
    docType: string
    label: string
    mediaId?: number
    externalUrl?: string
  }>
  variants: Array<{
    sku: string
    finish: string
    upc?: string | null
    msrp?: number | null
    inStock: boolean
    discontinued: boolean
    moq: number
    orderMultiple: number
    imageMediaIds: number[]
  }>
}

type Props = {
  product: ProductDetailDTO
  prices: Record<string, PriceDTO | undefined>
  contractListName?: string
}

export function ProductDetailView({ product, prices, contractListName }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialSku =
    searchParams.get('sku') ??
    pickDefaultVariantSku(product.variants, prices) ??
    product.variants[0]?.sku
  const [activeSku, setActiveSku] = useState(initialSku ?? '')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true,
    specs: false,
    installation: false,
  })
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const variant = product.variants.find((v) => v.sku === activeSku) ?? product.variants[0]!
  const canOrder = Boolean(variant && !variant.discontinued)
  const price = variant.discontinued ? undefined : prices[variant.sku]
  const images = variant.imageMediaIds.length ? variant.imageMediaIds : []

  const breaks = price?.quantityBreaks ?? []
  const tierRows = useMemo(() => {
    if (!price) return []
    const rows = [{ label: '1+', amount: price.unitPrice.amount }]
    for (const b of breaks) {
      rows.push({ label: `${b.minQuantity}+`, amount: b.unitPrice })
    }
    return rows
  }, [price, breaks])

  const selectSku = (sku: string) => {
    setActiveSku(sku)
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('sku', sku)
    router.replace(`/products/${product.slug}?${sp.toString()}`, { scroll: false })
  }

  return (
    <div className="as-pdp" data-testid="product-page">
      <nav className="as-breadcrumbs">
        <Link href="/">Home</Link>
        <span> / </span>
        <Link href="/catalog">Catalog</Link>
        <span> / </span>
        <span>{product.name}</span>
      </nav>

      <div className="as-pdp__hero">
        <div className="as-pdp__gallery">
          <ul className="as-pdp__thumbs">
            {images.map((id, index) => (
              <li key={id}>
                <button
                  type="button"
                  className={`as-pdp__thumb${lightboxIndex === index ? ' as-pdp__thumb--active' : ''}`}
                  onClick={() => setLightboxIndex(index)}
                >
                  <img src={vendorMediaPath(id)} alt="" />
                </button>
              </li>
            ))}
          </ul>
          {images[0] ? (
            <button
              type="button"
              className="as-pdp__main-image"
              onClick={() => setLightboxIndex(0)}
              data-testid="product-primary-image"
            >
              <img
                src={vendorMediaPath(images[lightboxIndex ?? 0] ?? images[0])}
                alt={product.name}
              />
            </button>
          ) : (
            <img src="/images/product-fallback.svg" alt="" data-testid="product-image-fallback" />
          )}
        </div>

        <div className="as-pdp__buybox" data-testid="product-buybox">
          <p className="as-pdp__collection">
            {product.productCollection}{' '}
            <Link href={`/catalog?collection=${encodeURIComponent(product.productCollection)}`}>
              Shop Collection
            </Link>
          </p>
          <h1>{product.name}</h1>
          <p className="as-pdp__sku" data-testid="product-active-sku">
            {variant.sku}
            {variant.upc ? ` · UPC ${variant.upc}` : ''}
          </p>
          <ul className="as-pdp__short-bullets">
            {product.shortBullets.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p className="as-pdp__finish-label">Finish: {variant.finish}</p>
          <div className="as-pdp__swatches">
            {product.variants.map((v) => (
              <button
                key={v.sku}
                type="button"
                className={`as-swatch as-swatch--lg${v.sku === variant.sku ? ' as-swatch--active' : ''}${!v.inStock || v.discontinued ? ' as-swatch--unavailable' : ''}`}
                style={{ backgroundColor: finishSwatchColor(v.finish) }}
                aria-label={v.finish}
                data-testid={`pdp-finish-${v.finish.replace(/\s+/g, '-')}`}
                onClick={() => selectSku(v.sku)}
              />
            ))}
          </div>
          {variant.discontinued ? (
            <p className="as-pdp__discontinued" data-testid="product-discontinued">
              This finish is discontinued and is not available to order.
            </p>
          ) : null}
          {price ? (
            <div className="as-pdp__pricing" data-testid={`product-price-${variant.sku}`}>
              <div className="as-pdp__price-row">
                <p className="as-pdp__your-price">
                  Your price ${price.unitPrice.amount.toFixed(2)} / ea ({price.source})
                </p>
                {variant.msrp && variant.msrp > price.unitPrice.amount ? (
                  <span className="as-pdp__list-price">${variant.msrp.toFixed(2)}</span>
                ) : null}
              </div>
              {tierRows.length > 1 ? (
                <table className="as-tier-table">
                  <thead>
                    <tr>
                      <th>Qty</th>
                      <th>Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tierRows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>${row.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {contractListName ? (
                <p className="as-pdp__contract">Contract: {contractListName}</p>
              ) : null}
            </div>
          ) : null}
          {canOrder ? (
            <div data-testid="product-order-cta">
              <AddToCartControls
                sku={variant.sku}
                moq={variant.moq}
                orderMultiple={variant.orderMultiple}
              />
              <Link href="/quotes/Q-2026-0001/order" className="as-btn-secondary">
                Add to quote
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <section className="as-accordion">
        <button
          type="button"
          className="as-accordion__head"
          onClick={() => setOpenSections((s) => ({ ...s, overview: !s.overview }))}
        >
          Product Overview {openSections.overview ? '−' : '+'}
        </button>
        {openSections.overview ? (
          <div className="as-accordion__body as-overview-grid">
            <ul>
              {product.featureBullets.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <div>
              <p>{product.description}</p>
              <h3>Resource</h3>
              <div className="as-doc-buttons">
                {product.documents.map((doc) =>
                  doc.mediaId ? (
                    <a
                      key={doc.docType}
                      href={vendorMediaPath(doc.mediaId, { download: true })}
                      className="as-doc-btn"
                      data-testid={`product-doc-${variant.sku}-${doc.docType === 'spec-sheet' ? 'spec' : doc.docType === 'install-instructions' ? 'install' : 'parts'}`}
                    >
                      {doc.label}
                    </a>
                  ) : doc.externalUrl ? (
                    <a
                      key={doc.docType}
                      href={doc.externalUrl}
                      className="as-doc-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {doc.label}
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="as-accordion">
        <button
          type="button"
          className="as-accordion__head"
          onClick={() => setOpenSections((s) => ({ ...s, specs: !s.specs }))}
        >
          Specifications {openSections.specs ? '−' : '+'}
        </button>
        {openSections.specs ? (
          <div className="as-accordion__body as-specs-grid">
            <div>
              {product.specGroups.map((group) => (
                <div key={group.groupName}>
                  <h3>{group.groupName}</h3>
                  <table>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.label}>
                          <th>{row.label}</th>
                          <td>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <div className="as-spec-downloads">
              {product.documents
                .filter((d) => d.mediaId && d.docType === 'spec-sheet')
                .map((d) => (
                  <a key={d.docType} href={vendorMediaPath(d.mediaId!, { download: true })} className="as-doc-btn">
                    Download Spec Sheets
                  </a>
                ))}
              {product.documents
                .filter((d) => d.externalUrl && d.docType === 'revit')
                .map((d) => (
                  <a key={d.docType} href={d.externalUrl} className="as-doc-btn" target="_blank" rel="noreferrer">
                    {PRODUCT_EXTERNAL_RESOURCE_LABELS['revit']}
                  </a>
                ))}
            </div>
          </div>
        ) : null}
      </section>

      {product.youtubeVideoId ? (
        <section className="as-accordion">
          <button
            type="button"
            className="as-accordion__head"
            onClick={() => setOpenSections((s) => ({ ...s, installation: !s.installation }))}
          >
            Installation {openSections.installation ? '−' : '+'}
          </button>
          {openSections.installation ? (
            <div className="as-accordion__body">
              <div className="as-video">
                <iframe
                  title="Installation video"
                  src={`https://www.youtube-nocookie.com/embed/${product.youtubeVideoId}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {lightboxIndex != null && images[lightboxIndex] ? (
        <div className="as-lightbox" role="dialog" onClick={() => setLightboxIndex(null)}>
          <img src={vendorMediaPath(images[lightboxIndex])} alt="" />
        </div>
      ) : null}
    </div>
  )
}


