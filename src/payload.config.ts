import { postgresAdapter } from '@payloadcms/db-postgres'
import { sql } from 'drizzle-orm'
import { uniqueIndex } from 'drizzle-orm/pg-core'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Carts } from './collections/Carts'
import { CartBulkAdds } from './collections/CartBulkAdds'
import { Companies } from './collections/Companies'
import { Media } from './collections/Media'
import { OrderEvents } from './collections/OrderEvents'
import { Orders } from './collections/Orders'
import { PriceLists } from './collections/PriceLists'
import { Products } from './collections/Products'
import { ProductVariants } from './collections/ProductVariants'
import { Quotes } from './collections/Quotes'
import { ShipToAddresses } from './collections/ShipToAddresses'
import { Users } from './collections/Users'
import { getEnv } from './env'
import { blobPluginStorageOptionsFromEnv } from './lib/blob-store-env'
import { allowedPayloadOrigins } from './lib/http/origin-allowlist'

const SHIP_TO_DEFAULT_INDEX = 'ship_to_addresses_one_default_per_company'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const env = getEnv()
const blobStorage = blobPluginStorageOptionsFromEnv(process.env)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  csrf: allowedPayloadOrigins(),
  cors: allowedPayloadOrigins(),
  collections: [
    Companies,
    Users,
    Media,
    Products,
    ProductVariants,
    PriceLists,
    Quotes,
    Orders,
    OrderEvents,
    ShipToAddresses,
    Carts,
    CartBulkAdds,
  ],
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL,
      max: env.DB_POOL_MAX ?? Number(process.env.DB_POOL_MAX ?? 10),
      connectionTimeoutMillis: 10_000,
    },
    push: process.env.PAYLOAD_DISABLE_PUSH === 'true' ? false : undefined,
    afterSchemaInit: [
      ({ schema }) => {
        const tables = (schema as {
          tables?: Record<string, { foreignKeys?: Record<string, { onDelete?: string; name?: string }> }>
        }).tables
        const orderEvents = tables?.order_events
        if (orderEvents?.foreignKeys) {
          for (const [name, fk] of Object.entries(orderEvents.foreignKeys)) {
            if (name.includes('order_id') || name.includes('company_id')) {
              fk.onDelete = 'restrict'
            }
          }
        }
        return schema
      },
      ({ schema, extendTable }) => {
        const table = schema.tables.ship_to_addresses
        if (!table) return schema
        extendTable({
          table,
          extraConfig: (cols) => ({
            [SHIP_TO_DEFAULT_INDEX]: uniqueIndex(SHIP_TO_DEFAULT_INDEX)
              .on(cols.company)
              .where(sql`${cols.isDefault} = true`),
          }),
        })
        return schema
      },
    ],
  }),
  plugins: [
    vercelBlobStorage({
      enabled: blobStorage.enabled,
      alwaysInsertFields: true,
      collections: {
        media: true,
      },
      token: blobStorage.token,
      access: blobStorage.access,
      addRandomSuffix: blobStorage.addRandomSuffix,
    }),
  ],
  sharp,
})
