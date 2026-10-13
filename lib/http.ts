import type { NextApiResponse } from 'next'

/**
 * Send a JSON response whose ETag is a *version* (e.g. the content store's
 * updated_at), not a hash of the body.
 *
 * `res.json()` goes through Next's sendData, which — with the default
 * `generateEtags: true` — overwrites any ETag header with its own body hash.
 * Editors send that header back as If-Match, so an overwritten tag never
 * matches the store version and every conditional save fails with 409.
 * Writing the payload with `res.end()` keeps the header exactly as set.
 */
export function sendVersionedJson(res: NextApiResponse, status: number, body: unknown, etag: string): void {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(payload))
  res.setHeader('ETag', etag)
  res.end(payload)
}

/**
 * Send a file body (Buffer) with the caller's ETag kept as set — same reason
 * as sendVersionedJson: `res.send()` would replace it with a body hash. The
 * caller sets Content-Type / Content-Disposition. `headOnly` writes the
 * headers and no body (HEAD requests).
 */
export function sendVersionedBody(res: NextApiResponse, status: number, body: Buffer, etag: string, headOnly = false): void {
  res.statusCode = status
  res.setHeader('Content-Length', body.length)
  res.setHeader('ETag', etag)
  res.end(headOnly ? undefined : body)
}

/** 304 Not Modified with the caller's ETag (no body). */
export function sendNotModified(res: NextApiResponse, etag: string): void {
  res.statusCode = 304
  res.setHeader('ETag', etag)
  res.end()
}
