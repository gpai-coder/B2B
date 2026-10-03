import pg from 'pg'

import { getEnv } from '@/env'

let pool: pg.Pool | null = null

export function getSearchDbPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getEnv().DATABASE_URL })
  }
  return pool
}

export async function querySearchDb<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  const result = await getSearchDbPool().query<T>(sql)
  return result.rows
}
