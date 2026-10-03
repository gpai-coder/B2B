import fs from 'fs/promises'
import path from 'path'

import { getPayload } from 'payload'

import { getCatalogMediaAuthFailure } from '@/access'
import { blobReadWriteTokenFromEnv } from '@/lib/blob-store-env'
import { resolveBlobMediaUrl } from '@/lib/blob-media-url'
import { serveBlobFileResponse } from '@/lib/serve-blob-file'
import { createPayloadReq } from '@/lib/payload-req'
import { getRequestUser } from '@/lib/session'
import config from '@/payload.config'

type RouteParams = { params: Promise<{ id: string }> }

async function resolveLocalMediaPath(filename: string): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), 'media', filename),
    path.join(process.cwd(), 'public', 'media', filename),
  ]
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      /* try next */
    }
  }
  return null
}

function mediaResponseHeaders(
  doc: { filename: string; mimeType?: string | null },
  contentType: string,
  disposition: string,
  contentLength?: number,
): Headers {
  const headers = new Headers({
    'Content-Type': doc.mimeType ?? contentType,
    'Content-Disposition': `${disposition}; filename="${doc.filename}"`,
    'Cache-Control': 'private, no-store',
  })
  if (contentLength != null) {
    headers.set('Content-Length', String(contentLength))
  }
  return headers
}

export async function GET(request: Request, { params }: RouteParams) {
  const user = await getRequestUser()
  const failure = getCatalogMediaAuthFailure(user)
  if (failure === 'unauthenticated') {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (failure === 'forbidden') {
    return Response.json({ error: 'Not authorized to access catalog media' }, { status: 403 })
  }

  const { id } = await params
  const mediaId = Number(id)
  if (!Number.isFinite(mediaId)) {
    return Response.json({ error: 'Invalid media id' }, { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  let doc
  try {
    doc = await payload.findByID({
      collection: 'media',
      id: mediaId,
      overrideAccess: false,
      req: createPayloadReq(payload, user!),
    })
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (!doc?.filename) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const filename = doc.filename
  const mediaDoc = { filename, mimeType: doc.mimeType }

  const url = new URL(request.url)
  const forceDownload = url.searchParams.get('download') === '1' || doc.mimeType === 'application/pdf'
  const disposition = forceDownload ? 'attachment' : 'inline'

  const localPath = await resolveLocalMediaPath(filename)
  if (localPath) {
    const data = await fs.readFile(localPath)
    return new Response(data, {
      headers: mediaResponseHeaders(mediaDoc, doc.mimeType ?? 'application/octet-stream', disposition, data.byteLength),
    })
  }

  const blobToken = blobReadWriteTokenFromEnv()
  if (blobToken) {
    return serveBlobFileResponse({
      filename,
      mimeType: doc.mimeType,
      disposition: forceDownload ? 'attachment' : 'inline',
      token: blobToken,
    })
  }

  const remoteUrl =
    doc.url && doc.url.startsWith('http') ? doc.url : resolveBlobMediaUrl(filename)
  if (remoteUrl) {
    const upstream = await fetch(remoteUrl, { cache: 'default' })
    if (!upstream.ok) {
      console.error('[vendor/media] upstream fetch failed', {
        mediaId,
        filename,
        status: upstream.status,
        url: remoteUrl,
      })
      return Response.json({ error: 'Failed to load media' }, { status: 502 })
    }
    if (!upstream.body) {
      return Response.json({ error: 'Failed to load media' }, { status: 502 })
    }
    const contentLength = upstream.headers.get('content-length')
    return new Response(upstream.body, {
      headers: mediaResponseHeaders(
        mediaDoc,
        doc.mimeType ?? upstream.headers.get('content-type') ?? 'application/octet-stream',
        disposition,
        contentLength ? Number(contentLength) : undefined,
      ),
    })
  }

  return Response.json({ error: 'Media file unavailable' }, { status: 404 })
}
