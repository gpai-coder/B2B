/**
 * Payload postgres connect runs interactive prodMigrations when NODE_ENV=production.
 * Temporarily use a non-production NODE_ENV only while initializing Payload.
 */
export function swapNodeEnvForPayloadConnect(
  env: Record<string, string | undefined> = process.env,
): () => void {
  const previous = env.NODE_ENV
  if (previous === 'production') {
    env.NODE_ENV = 'test'
  }
  return () => {
    if (previous === 'production') {
      env.NODE_ENV = previous
    }
  }
}
