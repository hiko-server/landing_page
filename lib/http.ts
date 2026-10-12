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
