import { describe, expect, it, vi } from 'vitest'

import { blobFileAccessFromEnv } from '@/lib/blob-server-read'

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
}))

import { get } from '@vercel/blob'

import { readBlobFile } from '@/lib/blob-server-read'

describe('readBlobFile', () => {
  it('reads using configured access', async () => {
    const getMock = vi.mocked(get)
    getMock.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      }),
      headers: new Headers(),
      blob: {
        url: 'https://example.com/x',
        downloadUrl: 'https://example.com/x?download=1',
        pathname: 'x.pdf',
        contentDisposition: 'inline',
        cacheControl: 'no-store',
        uploadedAt: new Date(),
        etag: 'e',
        contentType: 'application/pdf',
        size: 3,
      },
    })

    const result = await readBlobFile('x.pdf', 'token', 'public')
    expect(result?.contentType).toBe('application/pdf')
    expect(new Uint8Array(result!.data)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('defaults access from env', () => {
    expect(blobFileAccessFromEnv({ BLOB_FILE_ACCESS: 'private' })).toBe('private')
    expect(blobFileAccessFromEnv({})).toBe('public')
  })
})
