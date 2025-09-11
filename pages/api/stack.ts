import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const raw = fs.readFileSync(pkgPath, 'utf-8')
    const json = JSON.parse(raw)
    const deps = Object.keys(json.dependencies || {})
    const devDeps = Object.keys(json.devDependencies || {})
    // filter out definitely-not-stack items
    const blacklist = new Set(['nodemailer'])
    const list = [...deps, ...devDeps].filter((n) => !blacklist.has(n)).sort()
    return res.status(200).json({ packages: list })
  } catch {
    return res.status(200).json({ packages: [] })
  }
}

