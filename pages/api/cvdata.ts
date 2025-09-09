import type { NextApiRequest, NextApiResponse } from 'next'
import jwt from 'jsonwebtoken'
import { getCookie } from 'cookies-next'
import { readCvData, writeCvData, syncStructure } from '../../lib/cvdata'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

function isAuthed(req: NextApiRequest, res: NextApiResponse) {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return decoded?.role === 'admin'
  } catch {
    return false
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { en: enFile, zh: zhFile } = readCvData()
    // If empty, lazy-load from example bundle at build time via dynamic import using require
    let en = enFile
    let zh = zhFile
    try {
      if (!en.length || !zh.length) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const example = require('../../example/cvdata')
        en = en.length ? en : example.cvDataEnglish
        zh = zh.length ? zh : example.cvDataChinese
      }
    } catch (e) {
      // ignore if example not available at runtime
    }
    return res.status(200).json({ en, zh })
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const { en, zh, syncZh } = req.body || {}
    if (!en && !zh) return res.status(400).json({ error: 'Missing payload' })
    const current = readCvData()
    const newEn = en ?? current.en
    const newZh = syncZh ? syncStructure(newEn, zh ?? current.zh) : (zh ?? current.zh)
    writeCvData({ en: newEn, zh: newZh })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET,PUT')
  return res.status(405).json({ error: 'Method not allowed' })
}
