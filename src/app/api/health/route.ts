import { getPayload } from 'payload'

import { APP_VERSION } from '@/app-version'
import { getEnv } from '@/env'
import config from '@/payload.config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const env = getEnv()
  let db: 'connected' | 'error' = 'error'
  try {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
    db = 'connected'
  } catch {
    db = 'error'
  }

  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? APP_VERSION

  const status = db === 'connected' ? 'ok' : 'degraded'
  return Response.json(
    {
      status,
      version,
      db,
      env: env.NODE_ENV,
    },
    { status: db === 'connected' ? 200 : 503 },
  )
}
