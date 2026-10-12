import type { NextApiRequest, NextApiResponse } from 'next'
import { readStack } from '../../lib/stack'

/**
 * GET /api/stack → the site's own tech stack, grouped and human-named.
 * Computation lives in lib/stack.ts (shared with the /uses page).
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const stack = readStack()
  if (stack.groups.length) res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400')
  return res.status(200).json(stack)
}
