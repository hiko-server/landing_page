import { withApi } from '../../lib/apiHandler'
import { readStack } from '../../lib/stack'

/**
 * GET /api/stack → the site's own tech stack, grouped and human-named.
 * Computation lives in lib/stack.ts (shared with /uses and /colophon).
 */
export default withApi('stack', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const stack = readStack()
  if (stack.groups.length) res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400')
  return res.status(200).json(stack)
})
