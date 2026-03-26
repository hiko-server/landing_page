import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import { RemoteDataStatus } from '../../lib/github'

type ResponseBody = {
  status: RemoteDataStatus
  packages: string[]
}

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
    const data: ResponseBody = {
      status: list.length ? 'ok' : 'empty',
      packages: list,
    }
    return res.status(200).json(data)
  } catch {
    return res.status(200).json({ status: 'error', packages: [] })
  }
}
