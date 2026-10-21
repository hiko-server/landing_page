/**
 * Labels for the admin Security page (pure — unit tested).
 */

export type AuthMethodName = 'password' | 'passkey' | 'recovery' | 'legacy'

const METHOD: Record<AuthMethodName, string> = {
  password: 'Password',
  passkey: 'Passkey',
  recovery: 'Password + recovery code',
  legacy: 'Password (before passkeys)',
}

export function methodLabel(method: string | null | undefined): string {
  return (method && METHOD[method as AuthMethodName]) || '—'
}

const EVENT: Record<string, string> = {
  signin: 'Signed in',
  'signin-failed': 'Failed sign-in',
  'step-up': 'Confirmed identity',
  'step-up-failed': 'Failed identity check',
  signout: 'Signed out',
  'session-revoked': 'Signed a browser out',
  'sessions-revoked': 'Signed browsers out',
  'passkey-added': 'Added a passkey',
  'passkey-renamed': 'Renamed a passkey',
  'passkey-removed': 'Removed a passkey',
  'recovery-codes-generated': 'Created recovery codes',
  'recovery-code-used': 'Used a recovery code',
  'policy-changed': 'Changed the sign-in policy',
  'password-reset': 'Reset the password',
  'password-changed': 'Changed the password',
}

export function eventLabel(type: string): string {
  return EVENT[type] || type
}

/** True for history entries worth highlighting (failures). */
export function isWarningEvent(type: string): boolean {
  return type === 'signin-failed' || type === 'step-up-failed' || type === 'password-change-failed'
}

const FAILURE_METHOD: Record<string, string> = {
  password: 'password',
  passkey: 'passkey',
  recovery: 'password + recovery code',
  legacy: 'password',
}

const FAILURE_NOUN: Record<string, [string, string]> = {
  'step-up-failed': ['identity check', 'identity checks'],
  'password-change-failed': ['password change', 'password changes'],
}

/** "30 passkey sign-ins", "1 password identity check", "2 password changes" — one part of the failed-attempts breakdown. */
export function failureKindLabel(type: string, method: string | null, count: number): string {
  const [one, many] = FAILURE_NOUN[type] ?? ['sign-in', 'sign-ins']
  const noun = count === 1 ? one : many
  // A failed password change always means a wrong current password: no method word.
  const how = type === 'password-change-failed' ? '' : (method && FAILURE_METHOD[method]) || ''
  return [count.toLocaleString('en'), how, noun].filter(Boolean).join(' ')
}

/** "Hong Kong 25 · United States 10 · unknown 5" (Cloudflare country codes; null = unknown). */
export function failureCountriesLabel(
  countries: ReadonlyArray<{ country: string | null; count: number }>
): string {
  return countries
    .map(({ country, count }) => {
      let place = 'unknown'
      if (country) {
        try {
          place = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || country
        } catch {
          place = country
        }
      }
      return `${place} ${count.toLocaleString('en')}`
    })
    .join(' · ')
}

/** "Synced" for passkeys a provider backs up across devices, else "This device only". */
export function passkeySyncLabel(p: { backedUp: boolean; deviceType: string }): string {
  return p.backedUp || p.deviceType === 'multiDevice' ? 'Synced' : 'This device only'
}

/** "3 min ago", "in 7 min", "just now" (English UI, short style). */
export function relativeTime(ms: number, now: number): string {
  const diff = Math.round((ms - now) / 1000)
  const abs = Math.abs(diff)
  if (abs < 45) return diff <= 0 ? 'just now' : 'in a moment'
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), 'day')
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    ms
  )
}

/** "13 Oct 2026, 14:05" in the viewer's time zone. */
export function absoluteTime(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms)
}

/** "Hong Kong · 203.0.113.x" style network line (either part may be missing). */
export function whereLabel(
  country: string | null | undefined,
  ipPrefix: string | null | undefined
): string {
  let place = ''
  if (country) {
    try {
      place = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || country
    } catch {
      place = country
    }
  }
  return [place, ipPrefix || ''].filter(Boolean).join(' · ') || 'Unknown network'
}

/** The plain-text file a recovery-code download contains. */
export function recoveryCodesText(codes: string[], site: string, createdAt: number): string {
  return [
    `Recovery codes for the admin of ${site}`,
    `Created ${new Date(createdAt).toISOString().slice(0, 10)}. Each code works once; creating new codes cancels these.`,
    'Use one with your password when you cannot use a passkey.',
    '',
    ...codes,
    '',
  ].join('\n')
}
