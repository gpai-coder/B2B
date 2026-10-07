import { getHomeAuthEmail } from '@/lib/storefront/home-auth'
import './styles.css'

export default async function HomePage() {
  const email = await getHomeAuthEmail()

  return (
    <div className="home">
      <section className="hero">
        <h1>Pro buyer ordering</h1>
        <p>
          Browse LIXIL-style plumbing products, view contract pricing, and place orders against
          quotes. Version 1 runs fully on Postgres; SAP integration comes later via a commerce
          module swap.
        </p>
        {email ? (
          <p className="signed-in">Signed in as {email}</p>
        ) : (
          <p className="signed-in">Sign in via Payload admin or the vendor portal (upcoming).</p>
        )}
      </section>
      <section className="cards">
        <article className="card">
          <h2>Catalog</h2>
          <p>PLP/PDP with spec PDFs — collections land in PR 2.</p>
        </article>
        <article className="card">
          <h2>Pricing</h2>
          <p>Customer-specific price lists and quantity breaks.</p>
        </article>
        <article className="card">
          <h2>Orders</h2>
          <p>Draft orders, quote conversion, and idempotent submit.</p>
        </article>
      </section>
    </div>
  )
}
