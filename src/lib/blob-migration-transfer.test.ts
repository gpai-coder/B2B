import { describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
}))

import { get, put } from '@vercel/blob'

import {
  readMigrationSourceObject,
  writeMigrationDestObject,
} from '@/lib/blob-migration-transfer'

describe('blob migration transfer', () => {
  it('reads source via public store proxy path (access public + source token + CDN cache)', async () => {
    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([9]))
          c.close()
        },
      }),
      headers: new Headers(),
      blob: {
        url: 'https://store_abc.public.blob.vercel-storage.com/seed.png',
        downloadUrl: 'https://example.com/x',
        pathname: 'seed.png',
        contentDisposition: 'inline',
        cacheControl: 'public',
        uploadedAt: new Date(),
        etag: 'e1',
        contentType: 'image/png',
        size: 1,
      },
    })

    const out = await readMigrationSourceObject('seed.png', 'source-token')
    expect(out.buffer).toEqual(Buffer.from([9]))
    expect(get).toHaveBeenCalledWith('seed.png', {
      access: 'public',
      token: 'source-token',
      useCache: true,
    })
  })

  it('writes dest with private access and dest token', async () => {
    const body = Buffer.from('data')
    await writeMigrationDestObject('seed.png', body, 'dest-token', 'image/png')
    expect(put).toHaveBeenCalledWith('seed.png', body, {
      access: 'private',
      token: 'dest-token',
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
  })
})
