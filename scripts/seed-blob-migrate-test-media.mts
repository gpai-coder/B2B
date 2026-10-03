/** Creates one local media row for blob migration integration tests (no Blob token). */
delete process.env.BLOB_READ_WRITE_TOKEN
delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const { default: payloadConfig } = await import('../src/payload.config.ts')
const payload = await getPayload({ config: payloadConfig })

try {
  const pdfPath = path.join(repoRoot, 'scripts/fixtures/sample-spec.pdf')
  const pdfData = await fs.readFile(pdfPath)
  const doc = await payload.create({
    collection: 'media',
    data: { alt: 'blob-migrate integration test row' },
    file: {
      data: pdfData,
      mimetype: 'application/pdf',
      name: `blob-migrate-test-${Date.now()}.pdf`,
      size: pdfData.length,
    },
    overrideAccess: true,
  })
  process.stdout.write(JSON.stringify({ id: doc.id, filename: doc.filename }) + '\n')
} finally {
  await payload.destroy()
}
process.exit(0)
