import { formatIp, parseIp } from '../security/ip'
import { ipv6Network48 } from '../security/ipNetwork'

/**
 * Coarse, recognisable descriptions of where a sign-in came from — for the
 * owner's session list and sign-in history only. Never a full IP address or
 * user-agent string.
 */

/** Browser family from a user agent (order matters: Edge and Opera also say Chrome). */
export function browserFamily(ua: string): string {
  if (/Edg(?:e|A|iOS)?\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet'
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox'
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari'
  return 'Browser'
}

/** Operating system family from a user agent. */
export function osFamily(ua: string): string {
  if (/iPad/.test(ua)) return 'iPadOS'
  if (/iPhone|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux|X11/.test(ua)) return 'Linux'
  return ''
}

/** "Chrome on macOS" (or just the browser when the OS is unknown). */
export function deviceLabel(ua: string | undefined | null): string {
  const s = String(ua || '')
  if (!s) return 'Unknown device'
  const os = osFamily(s)
  const browser = browserFamily(s)
  return os ? `${browser} on ${os}` : browser
}

/** IPv4 → "203.0.113.x", IPv6 → its /48 ("2001:db8:1::/48"), else null. */
export function ipPrefix(raw: string | undefined | null): string | null {
  const addr = parseIp(raw)
  if (!addr) return null
  // This machine (a local run, or a request that came straight to the container).
  if (
    (addr.v === 4 && addr.bytes[0] === 127) ||
    (addr.v === 6 && addr.bytes.slice(0, 15).every((b) => b === 0) && addr.bytes[15] === 1)
  )
    return 'loopback'
  if (addr.v === 4)
    return `${formatIp({ v: 4, bytes: [...addr.bytes.slice(0, 3), 0] }).replace(/\.0$/, '')}.x`
  return ipv6Network48(raw)
}

/**
 * Passkey providers by AAGUID (the authenticator model id a passkey reports
 * at registration; the public, community-maintained list at
 * github.com/passkeydeveloper/passkey-authenticator-aaguids). Only used to
 * suggest a name the owner can change.
 */
const PROVIDERS: Record<string, string> = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
}

export function passkeyProvider(aaguid: string | null | undefined): string | null {
  return (aaguid && PROVIDERS[aaguid.toLowerCase()]) || null
}

/** Suggested passkey name: the provider when known, plus where it was added. */
export function suggestPasskeyName(
  aaguid: string | null | undefined,
  ua: string | null | undefined
): string {
  const provider = passkeyProvider(aaguid)
  const device = deviceLabel(ua)
  if (!provider) return device === 'Unknown device' ? 'Passkey' : device
  return provider === device ? provider : `${provider} (${device})`
}

/** A passkey label from the owner: trimmed, single-spaced, 1–60 characters, or null. */
export function cleanPasskeyName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  return Array.from(s).slice(0, 60).join('')
}
