/**
 * Credential masking for MongoDB connection strings.
 *
 * Multi-host URIs ("mongodb://u:p@h1:27017,h2:27017/db") are not valid WHATWG
 * URLs, so this parses the URI grammar directly:
 *
 *   scheme://[userinfo@]hosts[/path][?query]
 *
 * The userinfo is everything before the LAST "@" — so a password with an
 * unencoded "@" or "/" is still masked whole. If an "@" sits in the query
 * instead, more than the password is masked, never less. The username stays
 * visible (useful when debugging "auth failed"); the password and secret
 * query options are replaced with MASK.
 */

export const MASK = '••••'

const SECRET_PARAMS = new Set([
  'password',
  'authmechanismproperties', // may carry AWS_SESSION_TOKEN
  'tlscertificatekeyfilepassword',
  'sslpass',
  'proxypassword',
  'proxyusername',
])

function redactQuery(query: string): string {
  return query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=')
      const key = eq === -1 ? pair : pair.slice(0, eq)
      let decoded = key
      try {
        decoded = decodeURIComponent(key)
      } catch {
        decoded = key
      }
      return eq !== -1 && SECRET_PARAMS.has(decoded.toLowerCase()) ? `${key}=${MASK}` : pair
    })
    .join('&')
}

function maskUserinfo(userinfo: string): string {
  const colon = userinfo.indexOf(':')
  if (colon === -1) return MASK // a bare token could itself be the secret
  const user = userinfo.slice(0, colon)
  if (!user || /[/?#]/.test(user) || user.length > 128) return `${MASK}:${MASK}`
  return `${user}:${MASK}`
}

type UriParts = { scheme: string; userinfo: string | null; rest: string }

function split(uri: string): UriParts {
  const m = /^[a-z][a-z0-9+.-]*:\/\//i.exec(uri)
  const scheme = m ? m[0] : ''
  let rest = uri.slice(scheme.length)
  let userinfo: string | null = null
  const at = rest.lastIndexOf('@')
  if (at !== -1) {
    userinfo = rest.slice(0, at)
    rest = rest.slice(at + 1)
  }
  return { scheme, userinfo, rest }
}

/** Mask the credentials of one connection string. */
export function maskMongoUri(input: unknown): string {
  const uri = String(input ?? '').trim()
  if (!uri) return ''
  const { scheme, userinfo, rest } = split(uri)
  const q = rest.indexOf('?')
  const main = q === -1 ? rest : rest.slice(0, q)
  const query = q === -1 ? '' : `?${redactQuery(rest.slice(q + 1))}`
  return `${scheme}${userinfo !== null ? `${maskUserinfo(userinfo)}@` : ''}${main}${query}`
}

/** The password (raw and percent-decoded) embedded in a connection string, if any. */
export function mongoUriSecrets(input: unknown): string[] {
  const uri = String(input ?? '').trim()
  const { userinfo, rest } = split(uri)
  const out = new Set<string>()
  const add = (s: string) => {
    if (s.length < 3) return
    out.add(s)
    try {
      out.add(decodeURIComponent(s))
    } catch {
      /* not percent-encoded */
    }
  }
  if (userinfo !== null) {
    const colon = userinfo.indexOf(':')
    add(colon === -1 ? userinfo : userinfo.slice(colon + 1))
  }
  const q = rest.indexOf('?')
  if (q !== -1) {
    for (const pair of rest.slice(q + 1).split('&')) {
      const eq = pair.indexOf('=')
      if (eq !== -1 && SECRET_PARAMS.has(pair.slice(0, eq).toLowerCase())) add(pair.slice(eq + 1))
    }
  }
  return Array.from(out)
}

/**
 * Scrub free text (an error message, a log line): mask every embedded
 * mongodb:// / mongodb+srv:// URI, then replace any literal occurrence of the
 * secrets of `knownUris` (covers drivers that echo a password on its own).
 */
export function redactMongoSecrets(text: unknown, knownUris: Array<string | null | undefined> = []): string {
  let out = String(text ?? '')
  const secrets = knownUris.flatMap((u) => (u ? mongoUriSecrets(u) : [])).sort((a, b) => b.length - a.length)
  for (const s of secrets) out = out.split(s).join(MASK)
  return out.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>`]+/gi, (m) => maskMongoUri(m))
}
