#!/usr/bin/env -S node
/**
 * Copy catalog media from the legacy PUBLIC Vercel Blob store to a new PRIVATE store.
 *
 * Default is dry-run. Tokens default to BLOB_READ_WRITE_TOKEN (source) and
 * BLOB_PRIVATE_READ_WRITE_TOKEN (dest); override with BLOB_SOURCE_* / BLOB_DEST_*.
 */
process.env.PAYLOAD_DISABLE_PUSH = 'true'

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { get, head, put } from '@vercel/blob'
import { getPayload } from 'payload'

import {
  assertBlobStoreEnvConfigured,
  blobMigrationDestToken,
  blobMigrationSourceToken,
} from '../src/lib/blob-store-env.ts'

type FailureRecord = { id: number; filename: string; error: string; attempts: number }

type Checkpoint = {
  completedIds: number[]
  failures: FailureRecord[]
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
const maxAttempts = Number(
  [...args].find((a) => a.startsWith('--max-attempts='))?.split('=')[1] ?? '3',
)

async function loadCheckpoint(): Promise<Checkpoint> {
  try {
    const raw = await fs.readFile(checkpointPath, 'utf8')
    const parsed = JSON.parse(raw) as Checkpoint
    return {
      completedIds: parsed.completedIds ?? [],
      failures: (parsed.failures ?? []).map((f) => ({ ...f, attempts: f.attempts ?? 1 })),
    }
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
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 })
  const safe = filename.replace(/[^\w.-]+/g, '_')
  const out = path.join(backupDir, `${mediaId}__${safe}`)
  await fs.writeFile(out, data, { mode: 0o600 })
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

function failureForId(cp: Checkpoint, id: number) {
  return cp.failures.find((f) => f.id === id)
}

function recordFailure(cp: Checkpoint, id: number, filename: string, error: string) {
  const existing = failureForId(cp, id)
  if (existing) {
    existing.error = error
    existing.attempts += 1
    existing.filename = filename
  } else {
    cp.failures.push({ id, filename, error, attempts: 1 })
  }
}

function clearFailure(cp: Checkpoint, id: number) {
  cp.failures = cp.failures.filter((f) => f.id !== id)
}

function exhaustedFailures(cp: Checkpoint): FailureRecord[] {
  return cp.failures.filter((f) => f.attempts >= maxAttempts && !cp.completedIds.includes(f.id))
}

function exhaustedIds(cp: Checkpoint): number[] {
  return exhaustedFailures(cp).map((f) => f.id)
}

function buildExcludeIds(cp: Checkpoint, failedThisRun: Set<number>): number[] {
  return [...new Set([...cp.completedIds, ...failedThisRun, ...exhaustedIds(cp)])]
}

function activeFailures(cp: Checkpoint): FailureRecord[] {
  return cp.failures.filter((f) => !cp.completedIds.includes(f.id) && f.attempts < maxAttempts)
}

function resolveExitCode(cp: Checkpoint): number {
  if (activeFailures(cp).length > 0) return 1
  if (exhaustedFailures(cp).length > 0) return 1
  return 0
}

export async function runBlobTwoStoreMigration(): Promise<number> {
  process.env.PAYLOAD_DISABLE_PUSH = 'true'
  process.env.PAYLOAD_MIGRATING = 'true'
  // Payload connect(): production runs interactive prodMigrations; non-production + push:false skips drizzle push.
  if (process.env.NODE_ENV === 'production') {
    process.env.NODE_ENV = 'test'
  }

  assertBlobStoreEnvConfigured()

  const sourceToken = blobMigrationSourceToken()
  const destToken = blobMigrationDestToken()
  if (!sourceToken || !destToken) {
    throw new Error(
      'Missing tokens: set BLOB_READ_WRITE_TOKEN + BLOB_PRIVATE_READ_WRITE_TOKEN (or BLOB_SOURCE_* / BLOB_DEST_*)',
    )
  }
  if (deleteSource && !execute) {
    throw new Error('--delete-source requires --execute')
  }

  const cp = await loadCheckpoint()

  const { default: payloadConfig } = await import('../src/payload.config.ts')
  const payload = await getPayload({ config: payloadConfig })

  try {
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
      return 0
    }

    const failedThisRun = new Set<number>()

    while (true) {
      const excludeIds = buildExcludeIds(cp, failedThisRun)
      const batch = await payload.find({
        collection: 'media',
        where: excludeIds.length > 0 ? { id: { not_in: excludeIds } } : {},
        sort: 'id',
        limit: batchSize,
        overrideAccess: true,
      })
      if (batch.docs.length === 0) break

      for (const doc of batch.docs) {
        if (!doc.filename) {
          cp.completedIds.push(doc.id)
          clearFailure(cp, doc.id)
          await saveCheckpoint(cp)
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
          clearFailure(cp, doc.id)
          failedThisRun.delete(doc.id)
          processed++
          console.log(`ok id=${doc.id} ${filename} backup=${backupPath}`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          recordFailure(cp, doc.id, filename, message)
          failedThisRun.add(doc.id)
          console.error(
            `fail id=${doc.id} ${filename} attempts=${failureForId(cp, doc.id)?.attempts}:`,
            message,
          )
        }

        await saveCheckpoint(cp)
      }
    }

    const remaining = activeFailures(cp)
    const exhausted = exhaustedFailures(cp)
    console.log({
      mode: deleteSource ? 'execute+delete-source' : 'execute',
      processed,
      completed: cp.completedIds.length,
      activeFailures: remaining.length,
      exhausted: exhausted.length,
      checkpointPath,
    })

    return resolveExitCode(cp)
  } finally {
    await payload.destroy()
  }
}

const isMain =
  process.argv[1]?.includes('migrate-blob-two-store.mts') ||
  process.argv[1]?.includes('migrate-blob-two-store.mjs')

if (isMain) {
  runBlobTwoStoreMigration()
    .then((code) => {
      process.exit(code)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
