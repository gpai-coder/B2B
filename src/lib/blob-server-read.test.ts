import { describe, expect, it, vi } from 'vitest'

import { BlobReadError, openBlobReadStream } from '@/lib/blob-server-read'

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
}))

import { get } from '@vercel/blob'

describe('openBlobReadStream', () => {
  it('returns a stream with metadata on success', async () => {
    vi.mocked(get).mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([1]))
          c.close()
        },
      }),
      headers: new Headers(),
      blob: {
        url: 'https://example.com/x',
        downloadUrl: 'https://example.com/x?download=1',
        pathname: 'x.pdf',
        contentDisposition: 'inline',
        cacheControl: 'public',
        uploadedAt: new Date(),
        etag: 'etag-1',
        contentType: 'application/pdf',
        size: 1,
      },
    })

    const opened = await openBlobReadStream('x.pdf', 'token', 'public')
    expect(opened.contentType).toBe('application/pdf')
    expect(opened.contentLength).toBe(1)
    expect(opened.etag).toBe('etag-1')
    expect(get).toHaveBeenCalledWith('x.pdf', {
      access: 'public',
      token: 'token',
      useCache: true,
    })
  })

  it('wraps SDK failures in BlobReadError', async () => {
    vi.mocked(get).mockRejectedValueOnce(new Error('network'))
    await expect(openBlobReadStream('missing.bin', 'token')).rejects.toBeInstanceOf(BlobReadError)
  })
})
