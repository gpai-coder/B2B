import { postgresAdapter } from '@payloadcms/db-postgres'
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
import { Orders } from './collections/Orders'
import { PriceLists } from './collections/PriceLists'
import { Products } from './collections/Products'
import { ProductVariants } from './collections/ProductVariants'
import { Quotes } from './collections/Quotes'
import { Users } from './collections/Users'
import { getEnv } from './env'
import { blobPluginStorageOptionsFromEnv } from './lib/blob-store-env'

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
  collections: [
    Companies,
    Users,
    Media,
    Products,
    ProductVariants,
    PriceLists,
    Quotes,
    Orders,
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
      max: 20,
    },
    push: process.env.PAYLOAD_DISABLE_PUSH === 'true' ? false : undefined,
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
