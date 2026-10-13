import fs from 'fs'
import path from 'path'
import { withApi } from '../../lib/apiHandler'
import { readPublicCvSections } from '../../lib/cvdata'
import { SITE_URL } from '../../lib/schema'
import { buildSecurityTxt, securityContactFrom, securityPolicyUrl } from '../../lib/securityTxt'

/**
 * GET /.well-known/security.txt (rewritten here by next.config.js) — the
 * RFC 9116 file built by lib/securityTxt.ts.
 *
 * The contact is the e-mail the CV shows on the website (public, pruned
 * personal information); when the owner hides it there is no file (404),
 * never a made-up address. Expires is always 180 days ahead, so the file
 * cannot go stale; the policy link points at SECURITY.md in the repository
 * named by package.json.
 */

let policyUrl: string | null | undefined

function readPolicyUrl(): string | null {
  if (policyUrl !== undefined) return policyUrl
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { repository?: unknown }
    policyUrl = securityPolicyUrl(pkg.repository)
  } catch {
    policyUrl = null
  }
  return policyUrl
}

export default withApi('security-txt', (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    res.status(405).setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Method not allowed')
    return
  }
  const { en, zh } = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
  const email = securityContactFrom([...en, ...zh])
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  if (!email) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(404).end(req.method === 'HEAD' ? undefined : 'Not found')
    return
  }
  const body = buildSecurityTxt({ email, siteUrl: SITE_URL, policyUrl: readPolicyUrl(), now: Date.now() })
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  res.status(200).end(req.method === 'HEAD' ? undefined : body)
})
