'use client'

import Link from 'next/link'

import './styles.css'

export default function FrontendError() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Something went wrong</h1>
        <p>We could not complete that request. Please try again or contact your account manager.</p>
        <p>
          <Link href="/catalog">Return to catalog</Link>
        </p>
      </section>
    </div>
  )
}
