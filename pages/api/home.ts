import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome, writeHome, saveHomeSnapshot, listHomeSnapshots, restoreHomeSnapshot, readHomeSnapshot, type HomeData } from '../../lib/home'
import { sendMail } from '../../lib/mailer'
import { rateLimit } from '../../lib/rateLimit'
import { isAdminRequest } from '../../lib/auth'

const isAuthed = isAdminRequest

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // List home snapshots
    if (req.query.snapshots === '1') {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      return res.status(200).json({ files: listHomeSnapshots() })
    }
    // Download a specific snapshot
    if (req.query.download) {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      const file = req.query.file as string | undefined
      if (file) {
        const raw = readHomeSnapshot(file)
        if (!raw) return res.status(404).json({ error: 'Not found' })
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Content-Disposition', `attachment; filename="${file}"`)
        return res.status(200).send(raw)
      }
      const data = readHome()
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', 'attachment; filename="home.json"')
      return res.status(200).send(JSON.stringify(data, null, 2))
    }
    const data = readHome()
    return res.status(200).json(data)
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many updates, try later' })
    const body = req.body as HomeData
    if (!body || !body.hero || !body.socials || !Array.isArray(body.brands)) {
      return res.status(400).json({ error: 'Invalid payload' })
    }
    // Save snapshot before write
    try {
      saveHomeSnapshot()
    } catch (err) {
      console.warn('home: snapshot before write failed', err)
    }
    const writeResult = await writeHome(body)
    if (!writeResult.ok) return res.status(500).json({ error: writeResult.error })
    sendMail({
      to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hi@lucian-dev.com',
      subject: 'Home updated',
      text: `Home updated at ${new Date().toISOString()}`,
    }).catch((err) => console.warn('home: notification mail failed', err?.message || err))
    return res.status(200).json(writeResult)
  }

  if (req.method === 'POST') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    const { action, filename } = req.body || {}
    if (action === 'snapshot') {
      const file = saveHomeSnapshot()
      return res.status(200).json({ ok: true, file })
    }
    if (action === 'restore') {
      if (!filename) return res.status(400).json({ error: 'Missing filename' })
      try {
        saveHomeSnapshot()
      } catch (err) {
        console.warn('home: snapshot before restore failed', err)
      }
      const result = await restoreHomeSnapshot(filename)
      if (!result.ok) return res.status(404).json({ error: result.error })
      return res.status(200).json(result)
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,PUT,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

