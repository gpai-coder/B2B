import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import { afterAll, describe, expect, it } from 'vitest'

import config from '../src/payload.config'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const dummySource = 'vercel_blob_rw_aabbccdd_00112233445566778899aabbccdd001122'
const dummyDest = 'vercel_blob_rw_eeff0011_9988776655443322110099887766554433'

function runMigrationScript(args: string[], env: NodeJS.ProcessEnv, timeoutMs = 30_000) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>(
    (resolve) => {
      const stdoutChunks: string[] = []
      const stderrChunks: string[] = []
      const child = spawn(
        process.execPath,
        ['--import', 'tsx/esm', path.join(repoRoot, 'scripts/migrate-blob-two-store.mts'), ...args],
        {
          cwd: repoRoot,
          env: { ...process.env, ...env },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)

      child.stdout.on('data', (chunk) => stdoutChunks.push(String(chunk)))
      child.stderr.on('data', (chunk) => stderrChunks.push(String(chunk)))
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({
          code,
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          timedOut,
        })
      })
    },
  )
}

describe('migrate-blob-two-store.mts', () => {
  it(
    'dry-run exits within 30s without schema push output',
    async () => {
      if (!process.env.DATABASE_URL) {
        return
      }

      const result = await runMigrationScript([], {
        NODE_ENV: 'production',
        PAYLOAD_DISABLE_PUSH: 'true',
        PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'test-secret-min-16-chars',
        BLOB_READ_WRITE_TOKEN: dummySource,
        BLOB_PRIVATE_READ_WRITE_TOKEN: dummyDest,
      })

      expect(result.timedOut).toBe(false)
      expect(result.code).toBe(0)
      const combined = `${result.stdout}\n${result.stderr}`
      expect(combined).not.toMatch(/Pulling schema from database/i)
      expect(result.stdout).toMatch(/dry-run/)
    },
    35_000,
  )

  it(
    '--execute records one failure and exits 1 without looping',
    async () => {
      if (!process.env.DATABASE_URL) {
        return
      }

      const payloadConfig = await config
      const payload = await getPayload({ config: payloadConfig })
      const checkpointPath = path.join(
        os.tmpdir(),
        `blob-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      )

      try {
        const existing = await payload.find({
          collection: 'media',
          limit: 500,
          sort: 'id',
          overrideAccess: true,
        })
        expect(existing.docs.length).toBeGreaterThan(0)
        const target = existing.docs[existing.docs.length - 1]!
        const completedIds = existing.docs.filter((d) => d.id !== target.id).map((d) => d.id)

        await fs.writeFile(
          checkpointPath,
          JSON.stringify({
            completedIds,
            failures: [],
          }),
        )

        const result = await runMigrationScript(
          ['--execute', `--checkpoint=${checkpointPath}`, '--batch-size=25', '--max-attempts=3'],
          {
            NODE_ENV: 'production',
            PAYLOAD_DISABLE_PUSH: 'true',
            PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'test-secret-min-16-chars',
            BLOB_READ_WRITE_TOKEN: dummySource,
            BLOB_PRIVATE_READ_WRITE_TOKEN: dummyDest,
          },
        )

        expect(result.timedOut).toBe(false)
        expect(result.code).toBe(1)

        const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8')) as {
          failures: Array<{ id: number }>
        }
        expect(checkpoint.failures).toHaveLength(1)
        expect(checkpoint.failures[0]?.id).toBe(target.id)
      } finally {
        await payload.destroy()
        await fs.unlink(checkpointPath).catch(() => {})
      }
    },
    35_000,
  )
})
