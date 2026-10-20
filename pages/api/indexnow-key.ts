import { withApi } from '../../lib/apiHandler'
import { getIndexNowKey } from '../../lib/env'

/**
 * IndexNow key file, published at the site root as `/<INDEXNOW_KEY>.txt`:
 * proxy.ts rewrites exactly that path (and no other) to this route, and
 * lib/revalidate.ts submits changed URLs with `keyLocation:
 * https://<host>/<key>.txt`. The protocol only accepts URLs in the key
 * file's directory and below, so the file must be at the root to cover
 * every page. The key is not a secret (the protocol publishes it), but it is
 * served only when INDEXNOW_KEY is configured and well-formed — otherwise
 * 404, and IndexNow stays off.
 */
export default withApi('indexnow-key', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    res.status(405).setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Method not allowed')
    return
  }
  const key = getIndexNowKey()
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('X-Robots-Tag', 'noindex')
  if (!key) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(404).end('Not found')
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).end(req.method === 'HEAD' ? undefined : key)
})
