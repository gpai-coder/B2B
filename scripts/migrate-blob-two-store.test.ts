import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runDryRunMigration(env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>(
    (resolve) => {
      const stdoutChunks: string[] = []
      const stderrChunks: string[] = []
      const child = spawn(
        process.execPath,
        ['--import', 'tsx/esm', path.join(repoRoot, 'scripts/migrate-blob-two-store.mts')],
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
      }, 30_000)

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

      const result = await runDryRunMigration({
        NODE_ENV: 'production',
        PAYLOAD_DISABLE_PUSH: 'true',
        PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? 'test-secret-min-16-chars',
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_aabbccdd_00112233445566778899aabbccdd001122',
        BLOB_PRIVATE_READ_WRITE_TOKEN: 'vercel_blob_rw_eeff0011_9988776655443322110099887766554433',
      })

      expect(result.timedOut).toBe(false)
      expect(result.code).toBe(0)
      const combined = `${result.stdout}\n${result.stderr}`
      expect(combined).not.toMatch(/Pulling schema from database/i)
      expect(result.stdout).toMatch(/dry-run/)
    },
    35_000,
  )
})
