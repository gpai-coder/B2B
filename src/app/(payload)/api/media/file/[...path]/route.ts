import { getPayload } from 'payload'

import { getCatalogMediaAuthFailure } from '@/access'
import { serveBlobFileResponse } from '@/lib/media'
import { createPayloadReq } from '@/lib/payload-req'
import { getRequestUser } from '@/lib/session'
import config from '@/payload.config'

type RouteParams = { params: Promise<{ path: string[] }> }

/**
 * Token-based file handler for Payload `/api/media/file/*` previews.
 * The Vercel Blob plugin static handler fetches public URLs without a token;
 * private-store objects 403 there. This route takes precedence over the REST catch-all.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getRequestUser()
  const failure = getCatalogMediaAuthFailure(user)
  if (failure === 'unauthenticated') {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (failure === 'forbidden') {
    return Response.json({ error: 'Not authorized' }, { status: 403 })
  }

  const segments = (await params).path ?? []
  const filename = decodeURIComponent(segments.join('/'))
  if (!filename) {
    return Response.json({ error: 'Missing filename' }, { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const found = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    overrideAccess: false,
    req: createPayloadReq(payload, user!),
  })
  const doc = found.docs[0]
  if (!doc) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const disposition =
    doc.mimeType === 'application/pdf' ? ('attachment' as const) : ('inline' as const)

  return serveBlobFileResponse({
    filename: doc.filename!,
    mimeType: doc.mimeType,
    disposition,
  })
}
