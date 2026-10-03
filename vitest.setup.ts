import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv()

// Keep Payload from interactive schema push in CI/local vitest (must run before test files import payload.config).
process.env.PAYLOAD_DISABLE_PUSH ??= 'true'
