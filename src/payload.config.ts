import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Companies } from './collections/Companies'
import { Media } from './collections/Media'
import { Orders } from './collections/Orders'
import { PriceLists } from './collections/PriceLists'
import { Products } from './collections/Products'
import { ProductVariants } from './collections/ProductVariants'
import { Quotes } from './collections/Quotes'
import { Users } from './collections/Users'
import { getEnv } from './env'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const env = getEnv()
const blobEnabled = Boolean(env.BLOB_READ_WRITE_TOKEN)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Companies,
    Users,
    Media,
    Products,
    ProductVariants,
    PriceLists,
    Quotes,
    Orders,
  ],
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL,
    },
    prodMigrations: migrations,
    push: process.env.PAYLOAD_DISABLE_PUSH === 'true' ? false : undefined,
  }),
  plugins: [
    vercelBlobStorage({
      enabled: blobEnabled,
      /** Keep media schema stable in migrations whether or not BLOB_READ_WRITE_TOKEN is set. */
      alwaysInsertFields: true,
      collections: {
        media: true,
      },
      token: env.BLOB_READ_WRITE_TOKEN ?? '',
      // Seed idempotency relies on stable `media.filename` keys — never enable random suffixes.
      addRandomSuffix: false,
    }),
  ],
  sharp,
})
