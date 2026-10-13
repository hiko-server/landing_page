/**
 * RFC 9116 security.txt — the machine-readable "how to report a
 * vulnerability" file at /.well-known/security.txt (next.config.js rewrites
 * it to pages/api/security-txt.ts).
 *
 * Everything in it comes from data the site already publishes:
 *   Contact     mailto: the owner's e-mail from the PUBLIC CV personal
 *               information (website audience). No public e-mail, no file:
 *               the route answers 404 rather than invent a contact.
 *   Expires     always 180 days ahead of the response, so the file never
 *               goes stale between deploys (RFC 9116 asks for < 1 year).
 *   Canonical   the canonical origin (lib/schema SITE_URL).
 *   Policy      SECURITY.md in the repository named by package.json.
 *
 * Pure (no Node or DOM APIs) so it is unit-tested directly.
 */

export const SECURITY_TXT_PATH = '/.well-known/security.txt'
export const SECURITY_TXT_EXPIRES_DAYS = 180
const DAY_MS = 86_400_000

// Deliberately conservative: nothing that would need escaping in a mailto:
// URI or could break a line of the file.
const PUBLIC_EMAIL_RE = /^[A-Za-z0-9._+-]{1,64}@(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/

/** A well-formed public e-mail address (trimmed), or null. */
export function publicEmailOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim()
  return PUBLIC_EMAIL_RE.test(email) ? email : null
}

/**
 * The contact address from pruned (public) personalInformation sections,
 * first usable one wins. A hidden e-mail is already blanked by pruning, so
 * it can never be picked up here.
 */
export function securityContactFrom(sections: ReadonlyArray<unknown>): string | null {
  for (const section of sections) {
    const email = publicEmailOf((section as { email?: unknown } | null)?.email)
    if (email) return email
  }
  return null
}

/**
 * Web URL of a GitHub repository from package.json `repository` (a string or
 * `{ url }`): `git+https://github.com/o/r.git` → `https://github.com/o/r`.
 * Null for anything that is not a plain GitHub repository URL.
 */
export function repositoryWebUrl(repository: unknown): string | null {
  const raw = typeof repository === 'string' ? repository : (repository as { url?: unknown } | null)?.url
  if (typeof raw !== 'string') return null
  const m = /^(?:git\+)?(?:https?:\/\/|ssh:\/\/git@|git@)github\.com[/:]([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(raw.trim())
  if (!m) {
    const short = /^(?:github:)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(raw.trim())
    return short ? `https://github.com/${short[1]}/${short[2]}` : null
  }
  return `https://github.com/${m[1]}/${m[2]}`
}

/** The disclosure policy (SECURITY.md on the default branch) of that repository, or null. */
export function securityPolicyUrl(repository: unknown): string | null {
  const web = repositoryWebUrl(repository)
  return web ? `${web}/blob/main/SECURITY.md` : null
}

/** RFC 3339 instant `days` after `now`, whole seconds, UTC. */
export function securityTxtExpires(now: number, days = SECURITY_TXT_EXPIRES_DAYS): string {
  return new Date(now + days * DAY_MS).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export type SecurityTxtInput = {
  email: string
  /** Canonical origin, e.g. https://lucian-dev.com (no trailing slash). */
  siteUrl: string
  policyUrl: string | null
  now: number
}

/** The file body (LF line endings, trailing newline). */
export function buildSecurityTxt({ email, siteUrl, policyUrl, now }: SecurityTxtInput): string {
  const origin = siteUrl.replace(/\/+$/, '')
  const lines = [
    `# How to report a security vulnerability on ${origin.replace(/^https?:\/\//, '')} (RFC 9116).`,
    '# Please report privately; do not open a public issue.',
    `Contact: mailto:${email}`,
    `Expires: ${securityTxtExpires(now)}`,
    'Preferred-Languages: en, zh',
    `Canonical: ${origin}${SECURITY_TXT_PATH}`,
  ]
  if (policyUrl) lines.push(`Policy: ${policyUrl}`)
  return `${lines.join('\n')}\n`
}
