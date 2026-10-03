import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

loadEnv({ path: '.env.local' })
loadEnv()

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PAYLOAD_SECRET: z.string().min(16, 'PAYLOAD_SECRET must be at least 16 characters'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BLOB_PRIVATE_READ_WRITE_TOKEN: z.string().optional(),
  /** `public` (default) or `private` — must match the Vercel Blob store type. */
  BLOB_STORE_ACCESS: z.enum(['public', 'private']).optional(),
  NEXT_PUBLIC_SERVER_URL: z.string().url().optional(),
})

export type ServerEnv = z.infer<typeof serverSchema>

let cached: ServerEnv | null = null

/** Validated server environment. Throws on invalid/missing required vars. */
export function getEnv(): ServerEnv {
  if (cached) return cached
  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${message}`)
  }
  cached = parsed.data
  return parsed.data
}
