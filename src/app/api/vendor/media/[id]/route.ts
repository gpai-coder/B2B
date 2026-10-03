import fs from 'fs/promises'
import path from 'path'

import { getPayload } from 'payload'

import { getCatalogMediaAuthFailure } from '@/access'
import { readBlobFile } from '@/lib/blob-server-read'
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

  const url = new URL(request.url)
  const forceDownload = url.searchParams.get('download') === '1' || doc.mimeType === 'application/pdf'
  const disposition = forceDownload ? 'attachment' : 'inline'

  const localPath = await resolveLocalMediaPath(doc.filename)
  if (localPath) {
    const data = await fs.readFile(localPath)
    return new Response(data, {
      headers: {
        'Content-Type': doc.mimeType ?? 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${doc.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const remoteUrl =
    doc.url && doc.url.startsWith('http') ? doc.url : null
  if (remoteUrl) {
    const upstream = await fetch(remoteUrl, { cache: 'no-store' })
    if (!upstream.ok) {
      return Response.json({ error: 'Failed to load media' }, { status: 502 })
    }
    const buffer = await upstream.arrayBuffer()
    return new Response(buffer, {
      headers: {
        'Content-Type': doc.mimeType ?? upstream.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${doc.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (token) {
    const blob = await readBlobFile(doc.filename, token)
    if (blob) {
      return new Response(blob.data, {
        headers: {
          'Content-Type': doc.mimeType ?? blob.contentType,
          'Content-Disposition': `${disposition}; filename="${doc.filename}"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }
  }

  return Response.json({ error: 'Media file unavailable' }, { status: 404 })
}
