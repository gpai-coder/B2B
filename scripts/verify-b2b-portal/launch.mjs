#!/usr/bin/env node
/**
 * Start local Postgres (docker), migrate/seed, and Next dev for verification.
 * Writes PID to artifacts/verify-b2b-portal/<runId>/dev.pid
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { artifactsDir, baseUrl, loadVerificationEnv, repoRootPath } from './lib/env.mjs'

const runId = process.env.VERIFY_RUN_ID ?? `run-${Date.now()}`
const repo = repoRootPath()
const outDir = artifactsDir(runId)
const pidFile = path.join(outDir, 'dev.pid')
const logFile = path.join(outDir, 'dev.log')

loadVerificationEnv()

const envLocal = path.join(repo, '.env.local')
if (!fs.existsSync(envLocal)) {
  fs.copyFileSync(path.join(repo, '.env.example'), envLocal)
  const secret = spawnSync('openssl', ['rand', '-base64', '32'], { encoding: 'utf8' }).stdout.trim()
  if (secret) {
    let text = fs.readFileSync(envLocal, 'utf8')
    text = text.replace('PAYLOAD_SECRET=change-me-to-a-long-random-string', `PAYLOAD_SECRET=${secret}`)
    fs.writeFileSync(envLocal, text)
  }
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repo,
    env: { ...process.env, PAYLOAD_DISABLE_PUSH: 'true', ...opts.env },
    encoding: 'utf8',
    stdio: opts.silent ? 'pipe' : 'inherit',
  })
  if (res.status !== 0) {
    process.stderr.write(res.stderr ?? '')
    process.exit(res.status ?? 1)
  }
  return res
}

run('docker', ['compose', 'up', '-d', 'postgres'])
for (let i = 0; i < 30; i++) {
  const ready = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'portal', '-d', 'b2b_portal'], {
    cwd: repo,
    encoding: 'utf8',
  })
  if (ready.status === 0) break
  spawnSync('sleep', ['1'])
}

loadVerificationEnv()
run('pnpm', ['db:migrate'])
run('pnpm', ['db:seed'])

const healthUrl = `${baseUrl()}/api/health`
try {
  const existing = await fetch(healthUrl, { signal: AbortSignal.timeout(3_000) })
  if (existing.ok) {
    const body = await existing.json()
    if (body?.db === 'connected') {
      process.stdout.write(`verify-b2b-portal launch: reusing server at ${baseUrl()}\n`)
      process.stdout.write(`VERIFY_RUN_ID=${runId}\n`)
      process.stdout.write(`ARTIFACTS_DIR=${outDir}\n`)
      process.exit(0)
    }
  }
} catch {
  // start fresh
}

const logFd = fs.openSync(logFile, 'a')
const child = spawn('pnpm', ['dev'], {
  cwd: repo,
  env: {
    ...process.env,
    PAYLOAD_DISABLE_PUSH: 'true',
    PORT: '3000',
    HOSTNAME: '127.0.0.1',
  },
  detached: true,
  stdio: ['ignore', logFd, logFd],
})
child.unref()
fs.writeFileSync(pidFile, String(child.pid))

for (let i = 0; i < 120; i++) {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) })
    const body = await res.json()
    if (res.ok && body?.db === 'connected') {
      process.stdout.write(`verify-b2b-portal launch: ready at ${baseUrl()} (pid ${child.pid})\n`)
      process.stdout.write(`VERIFY_RUN_ID=${runId}\n`)
      process.stdout.write(`ARTIFACTS_DIR=${outDir}\n`)
      process.exit(0)
    }
  } catch {
    spawnSync('sleep', ['1'])
  }
}

process.stderr.write('verify-b2b-portal launch: timed out waiting for /api/health\n')
process.exit(1)
