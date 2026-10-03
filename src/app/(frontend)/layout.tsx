import React from 'react'
import Link from 'next/link'
import { Montserrat } from 'next/font/google'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body style={{ fontFamily: 'var(--font-montserrat), Montserrat, sans-serif' }}>
        <header className="site-header">
          <div className="site-header__inner">
            <Link className="site-logo" href="/">
              B2B Portal
            </Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/">Home</Link>
              <Link href="/catalog">Catalog</Link>
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
