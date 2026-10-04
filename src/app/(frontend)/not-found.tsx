import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Page not found</h1>
        <p>The page you requested does not exist or you may not have access to it.</p>
        <p>
          <Link href="/catalog">Return to catalog</Link>
        </p>
      </section>
    </div>
  )
}
