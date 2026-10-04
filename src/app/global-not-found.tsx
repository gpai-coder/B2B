import Link from 'next/link'

import { BrandedNotFound } from '@/components/site/BrandedNotFound'

import './(frontend)/styles.css'

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <Link className="site-logo" href="/">
              B2B Portal
            </Link>
          </div>
        </header>
        <main className="site-main">
          <BrandedNotFound />
        </main>
      </body>
    </html>
  )
}
