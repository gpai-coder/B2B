import Link from 'next/link'
import { Montserrat } from 'next/font/google'

import { CatalogSearchBox } from '@/components/catalog/CatalogSearchBox'
import { getRequestUser } from '@/lib/session'

import './styles.css'
import './as-catalog.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
})

export const metadata = {
  description: 'B2B ordering portal for American Standard plumbing products.',
  title: 'B2B Ordering Portal',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getRequestUser()
  const authenticated = Boolean(user && user.role === 'vendor-buyer')

  return (
    <html lang="en" className={montserrat.variable}>
      <body style={{ fontFamily: 'var(--font-montserrat), Montserrat, sans-serif' }}>
        <header className="site-header">
          <div className="site-header__inner">
            <Link className="site-logo" href="/">
              B2B Portal
            </Link>
            <CatalogSearchBox authenticated={authenticated} />
            <nav className="site-nav" aria-label="Main">
              <Link href="/">Home</Link>
              <Link href="/catalog">Catalog</Link>
              {authenticated ? <Link href="/cart">Cart</Link> : null}
              {authenticated ? <Link href="/orders">Orders</Link> : null}
              {authenticated ? <Link href="/quotes">Quotes</Link> : null}
              {authenticated ? <Link href="/account">Account</Link> : null}
              {authenticated ? <Link href="/quick-order">Quick order</Link> : null}
              <Link href="/login">Vendor login</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </div>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <p>American Standard B2B catalog — contract pricing for approved vendors.</p>
        </footer>
      </body>
    </html>
  )
}
