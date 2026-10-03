#!/usr/bin/env -S node
/**
 * Copy catalog media from the legacy PUBLIC Vercel Blob store to a new PRIVATE store.
 *
 * Default is dry-run. Requires separate source/dest tokens (public vs private stores).
 *
 * Usage:
 *   BLOB_SOURCE_READ_WRITE_TOKEN=... BLOB_DEST_READ_WRITE_TOKEN=... DATABASE_URL=... PAYLOAD_SECRET=... \\
 *     pnpm exec tsx scripts/migrate-blob-two-store.mts
 *
 *   ... --execute              # perform copies (still no source deletes unless --delete-source)
 *   ... --execute --delete-source
 *   ... --checkpoint=.blob-migrate.json
 *   ... --backup-dir=./blob-backup
 *   ... --batch-size=25
 */
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { get, head, put } from '@vercel/blob'
import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

type Checkpoint = {
  completedIds: number[]
  failures: Array<{ id: number; filename: string; error: string }>
}

const args = new Set(process.argv.slice(2))
const execute = args.has('--execute')
const deleteSource = args.has('--delete-source')
const checkpointPath =
  [...args].find((a) => a.startsWith('--checkpoint='))?.split('=')[1] ?? '.blob-migrate-checkpoint.json'
const backupDir =
  [...args].find((a) => a.startsWith('--backup-dir='))?.split('=')[1] ?? './blob-migration-backup'
const batchSize = Number(
  [...args].find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? '25',
)

async function loadCheckpoint(): Promise<Checkpoint> {
  try {
    const raw = await fs.readFile(checkpointPath, 'utf8')
    return JSON.parse(raw) as Checkpoint
  } catch {
    return { completedIds: [], failures: [] }
  }
}

async function saveCheckpoint(cp: Checkpoint) {
  await fs.writeFile(checkpointPath, JSON.stringify(cp, null, 2))
}

async function sha256(buffer: Buffer): Promise<string> {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function backupFile(mediaId: number, filename: string, data: Buffer) {
  await fs.mkdir(backupDir, { recursive: true })
  const safe = filename.replace(/[^\w.-]+/g, '_')
  const out = path.join(backupDir, `${mediaId}__${safe}`)
  await fs.writeFile(out, data)
  return out
}

async function readPublicObject(filename: string, sourceToken: string): Promise<Buffer> {
  const result = await get(filename, { access: 'public', token: sourceToken, useCache: false })
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Source read failed for ${filename} (status ${result?.statusCode ?? 'unknown'})`)
  }
  return Buffer.from(await new Response(result.stream).arrayBuffer())
}

async function verifyDest(
  filename: string,
  destToken: string,
  expectedSize: number,
  expectedSha256: string,
): Promise<void> {
  const meta = await head(filename, { token: destToken })
  if (meta.size !== expectedSize) {
    throw new Error(`Dest size mismatch for ${filename}: ${meta.size} !== ${expectedSize}`)
  }
  const downloaded = await get(filename, { access: 'private', token: destToken, useCache: false })
  if (!downloaded || downloaded.statusCode !== 200 || !downloaded.stream) {
    throw new Error(`Dest re-read failed for ${filename}`)
  }
  const hash = await sha256(Buffer.from(await new Response(downloaded.stream).arrayBuffer()))
  if (hash !== expectedSha256) {
    throw new Error(`Dest sha256 mismatch for ${filename}`)
  }
}

async function main() {
  const sourceToken = process.env.BLOB_SOURCE_READ_WRITE_TOKEN
  const destToken = process.env.BLOB_DEST_READ_WRITE_TOKEN
  if (!sourceToken || !destToken) {
    throw new Error('BLOB_SOURCE_READ_WRITE_TOKEN and BLOB_DEST_READ_WRITE_TOKEN are required')
  }
  if (deleteSource && !execute) {
    throw new Error('--delete-source requires --execute')
  }

  const cp = await loadCheckpoint()

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  let processed = 0

  if (!execute) {
    let page = 1
    while (true) {
      const batch = await payload.find({
        collection: 'media',
        sort: 'id',
        page,
        limit: batchSize,
        overrideAccess: true,
      })
      if (batch.docs.length === 0) break
      for (const doc of batch.docs) {
        if (!doc.filename) continue
        console.log(`[dry-run] would migrate id=${doc.id} ${doc.filename}`)
        processed++
      }
      if (batch.docs.length < batchSize) break
      page++
    }
    console.log({ mode: 'dry-run', processed, checkpointPath })
    return
  }

  while (true) {
    const batch = await payload.find({
      collection: 'media',
      where:
        cp.completedIds.length > 0
          ? { id: { not_in: cp.completedIds } }
          : {},
      sort: 'id',
      limit: batchSize,
      overrideAccess: true,
    })
    if (batch.docs.length === 0) break

    for (const doc of batch.docs) {
      if (!doc.filename) {
        cp.completedIds.push(doc.id)
        continue
      }

      const filename = doc.filename
      try {
        const bytes = await readPublicObject(filename, sourceToken)
        const digest = await sha256(bytes)
        const backupPath = await backupFile(doc.id, filename, bytes)

        const sourceMeta = await head(filename, { token: sourceToken })

        await put(filename, bytes, {
          access: 'private',
          token: destToken,
          contentType: doc.mimeType ?? 'application/octet-stream',
          addRandomSuffix: false,
          allowOverwrite: true,
        })

        await verifyDest(filename, destToken, bytes.length, digest)

        if (deleteSource) {
          const destMeta = await head(filename, { token: destToken })
          if (destMeta.size !== sourceMeta.size) {
            throw new Error('Refusing to delete source: dest head size mismatch')
          }
          const { del } = await import('@vercel/blob')
          await del(sourceMeta.url, { token: sourceToken })
        }

        cp.completedIds.push(doc.id)
        processed++
        console.log(`ok id=${doc.id} ${filename} backup=${backupPath}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        cp.failures.push({ id: doc.id, filename, error: message })
        console.error(`fail id=${doc.id} ${filename}:`, message)
      }

      await saveCheckpoint(cp)
    }

    if (batch.docs.length < batchSize) break
  }

  console.log({
    mode: execute ? (deleteSource ? 'execute+delete-source' : 'execute') : 'dry-run',
    processed,
    completed: cp.completedIds.length,
    failures: cp.failures.length,
    checkpointPath,
  })

  if (cp.failures.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
