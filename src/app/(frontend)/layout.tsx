import React from 'react'
import Link from 'next/link'
import './styles.css'

export const metadata = {
  description: 'B2B ordering portal for plumbing products (LIXIL-style).',
  title: 'B2B Ordering Portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <Link className="site-logo" href="/">
              B2B Portal
            </Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/">Home</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </div>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <p>Foundations phase — catalog and ordering coming in follow-up PRs.</p>
        </footer>
      </body>
    </html>
  )
}
