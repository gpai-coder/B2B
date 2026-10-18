#!/usr/bin/env node
/**
 * Stop only the dev server started by launch.mjs (PID file). Leaves Docker Postgres running.
 */
import fs from 'node:fs'
import path from 'node:path'

import { artifactsDir, repoRootPath } from './lib/env.mjs'

const runId = process.env.VERIFY_RUN_ID
if (!runId) {
  process.stderr.write('VERIFY_RUN_ID is required for cleanup\n')
  process.exit(1)
}

const pidFile = path.join(artifactsDir(runId), 'dev.pid')
if (!fs.existsSync(pidFile)) {
  process.stdout.write('verify-b2b-portal cleanup: no dev.pid (nothing to stop)\n')
  process.exit(0)
}

const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
if (!Number.isFinite(pid)) {
  process.stderr.write('verify-b2b-portal cleanup: invalid pid file\n')
  process.exit(1)
}

try {
  process.kill(pid, 'SIGTERM')
  process.stdout.write(`verify-b2b-portal cleanup: sent SIGTERM to pid ${pid}\n`)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stdout.write(`verify-b2b-portal cleanup: ${msg}\n`)
}

fs.unlinkSync(pidFile)
process.stdout.write(`Artifacts preserved under ${path.join(repoRootPath(), 'artifacts', 'verify-b2b-portal', runId)}\n`)
