import type { NextApiRequest, NextApiResponse } from 'next'
import { deleteCookie } from 'cookies-next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  deleteCookie('cv_admin_token', { req, res, path: '/' })
  res.status(200).json({ ok: true })
}

