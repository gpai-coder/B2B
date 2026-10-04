'use client'

export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '40rem' }}>
          <h1>Something went wrong</h1>
          <p>Please try again later.</p>
        </main>
      </body>
    </html>
  )
}
