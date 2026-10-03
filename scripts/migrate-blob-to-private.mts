/**
 * One-off: re-upload existing Vercel Blob media as `access: private` and update Payload rows.
 *
 * Usage (production maintenance window):
 *   BLOB_READ_WRITE_TOKEN=... DATABASE_URL=... PAYLOAD_SECRET=... \\
 *     pnpm exec tsx scripts/migrate-blob-to-private.mts [--dry-run] [--limit N]
 *
 * After all rows succeed, set BLOB_FILE_ACCESS=private on Vercel and redeploy.
 */
import { getPayload } from 'payload'
import { del, get, head, put } from '@vercel/blob'

import config from '../src/payload.config.ts'

const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required')
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const all = await payload.find({
    collection: 'media',
    limit: limit ?? 500,
    pagination: limit ? false : true,
    overrideAccess: true,
  })

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const doc of all.docs) {
    const filename = doc.filename
    if (!filename) {
      skipped++
      continue
    }

    try {
      const meta = await head(filename, { token })
      if (meta.url.includes('.private.blob.vercel-storage.com')) {
        skipped++
        continue
      }

      const downloaded = await get(filename, { access: 'public', token, useCache: false })
      if (downloaded.statusCode !== 200 || !downloaded.stream) {
        throw new Error(`Could not download public blob ${filename}`)
      }
      const buffer = Buffer.from(await new Response(downloaded.stream).arrayBuffer())

      if (dryRun) {
        console.log(`[dry-run] would migrate ${filename} (${buffer.length} bytes)`)
        migrated++
        continue
      }

      await put(filename, buffer, {
        access: 'private',
        token,
        contentType: doc.mimeType ?? downloaded.blob.contentType,
        allowOverwrite: true,
        addRandomSuffix: false,
      })

      await del(meta.url, { token })

      await payload.update({
        collection: 'media',
        id: doc.id,
        data: {},
        overrideAccess: true,
      })

      migrated++
      console.log(`migrated ${filename}`)
    } catch (err) {
      failed++
      console.error(`failed ${filename}:`, err)
    }
  }

  console.log({ migrated, skipped, failed, total: all.docs.length })
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
