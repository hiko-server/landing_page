/**
 * The admin password policy (pure — no Node APIs; the server enforces it in
 * lib/adminAuth/password.ts, and Admin → Security imports the same rules for
 * its live checklist, so the two can never disagree).
 *
 * Follows NIST SP 800-63B §3.1.1.2 / OWASP ASVS V2.1 rather than the old
 * composition rules:
 *   - length counts Unicode code points after NFKC normalisation (the form
 *     sign-in hashes — lib/admin.ts normalizePassword), 12 to 256 of them;
 *     every character is allowed, spaces and emoji included, and nothing
 *     is trimmed or truncated;
 *   - no "one upper case, one digit, one symbol" rule — instead the
 *     password is refused when it is predictable: built from a very common
 *     password word (a small bundled list, matched through look-alike
 *     substitutions such as p@ssw0rd), keyboard or alphabet runs, repeats
 *     and years, the way Microsoft Entra's banned-password check scores
 *     what is left (each common piece counts once, every other character
 *     once; fewer than MIN_UNITS units is refused);
 *   - it may not contain the account e-mail's name or the site's name;
 *   - a new password may not equal the current one (compared normalised).
 *
 * The strength shown in the admin is a rough estimate from the same units
 * and the character classes used; the policy decides, the meter only guides.
 */

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 256
/** Fewer unpredictable units than this is refused (see predictableUnits). */
export const MIN_UNITS = 8

/**
 * NFKC (NIST SP 800-63B: the "normalization process for stabilized
 * strings"): a full-width "ｐａｓｓ" and "pass", or a composed "é" and "e" +
 * U+0301, are the same password on every keyboard and device.
 */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC')
}

/** Length in Unicode code points after normalisation (an emoji counts once). */
export function passwordLength(password: string): number {
  return Array.from(normalizePassword(password)).length
}

/**
 * Very common password words, lower case, at least five letters (shorter
 * ones would cut into ordinary passphrases): the roots of the most used
 * passwords in public breach statistics (names, sports, seasons, months,
 * keyboard words, "I love you" in a few languages). Sequences such as
 * "qwerty" or "123456" are caught by SEQUENCES, so they are not repeated here.
 */
export const COMMON_PASSWORD_WORDS: readonly string[] = [
  'password',
  'passwort',
  'passwd',
  'passcode',
  'mypassword',
  'iloveyou',
  'iloveu',
  'loveme',
  'lovely',
  'princess',
  'administrator',
  'admin',
  'welcome',
  'letmein',
  'changeme',
  'default',
  'secret',
  'access',
  'master',
  'monkey',
  'dragon',
  'shadow',
  'sunshine',
  'football',
  'baseball',
  'basketball',
  'soccer',
  'hockey',
  'superman',
  'batman',
  'spiderman',
  'starwars',
  'pokemon',
  'naruto',
  'trustno',
  'whatever',
  'freedom',
  'hello',
  'login',
  'charlie',
  'michael',
  'jessica',
  'ashley',
  'jennifer',
  'thomas',
  'daniel',
  'andrew',
  'joshua',
  'matthew',
  'jordan',
  'hunter',
  'ranger',
  'harley',
  'robert',
  'george',
  'michelle',
  'nicole',
  'anthony',
  'william',
  'summer',
  'winter',
  'spring',
  'autumn',
  'january',
  'february',
  'march',
  'april',
  'august',
  'september',
  'october',
  'november',
  'december',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'computer',
  'internet',
  'service',
  'server',
  'system',
  'security',
  'killer',
  'cookie',
  'cheese',
  'chocolate',
  'banana',
  'orange',
  'purple',
  'yellow',
  'silver',
  'golden',
  'diamond',
  'flower',
  'blossom',
  'butterfly',
  'angel',
  'babygirl',
  'mustang',
  'ferrari',
  'porsche',
  'corvette',
  'mercedes',
  'tigger',
  'ginger',
  'pepper',
  'buster',
  'maggie',
  'bailey',
  'tester',
  'testing',
  'samsung',
  'apple',
  'google',
  'iphone',
  'android',
  'facebook',
  'youtube',
  'linkedin',
  'microsoft',
  'windows',
  'matrix',
  'hacker',
  'oracle',
  'phoenix',
  'liverpool',
  'chelsea',
  'arsenal',
  'barcelona',
  'london',
  'hongkong',
  'shanghai',
  'beijing',
  'woaini',
  'nihao',
  'sakura',
  'guest',
]

/**
 * Character orders people type as runs: the alphabet, digits (wrapping 9→0),
 * keyboard rows and columns of QWERTY, QWERTZ and AZERTY, and the shifted
 * number row. A run of three or more neighbours, either way, counts once.
 */
const SEQUENCES: readonly string[] = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890',
  '`1234567890-=',
  '~!@#$%^&*()_+',
  'qwertyuiop[]\\',
  "asdfghjkl;'",
  'zxcvbnm,./',
  'qwertyuiopasdfghjklzxcvbnm',
  'qwertzuiopasdfghjklyxcvbnm',
  'azertyuiopqsdfghjklmwxcvbn',
  '1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p',
  'qazwsxedcrfvtgbyhnujmikolp',
]

/** Look-alike substitutions (p@ssw0rd → password); "1" is tried as both i and l. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
  '6': 'g',
  '2': 'z',
  '|': 'l',
}

const WORDS_BY_LENGTH = [...COMMON_PASSWORD_WORDS].sort((a, b) => b.length - a.length)

type SeqPairs = { forward: Set<string>; backward: Set<string> }
const SEQ_PAIRS: SeqPairs[] = SEQUENCES.map((s) => {
  const forward = new Set<string>()
  const backward = new Set<string>()
  for (let i = 0; i + 1 < s.length; i++) {
    forward.add(s[i] + s[i + 1])
    backward.add(s[i + 1] + s[i])
  }
  return { forward, backward }
})

/** Lower-case code points of the normalised password, plus its two look-alike readings. */
function readings(password: string): { chars: string[]; leetI: string[]; leetL: string[] } {
  const chars = Array.from(normalizePassword(password)).map((c) => c.toLowerCase())
  const leetI = chars.map((c) => LEET[c] ?? c)
  const leetL = chars.map((c) => (c === '1' ? 'l' : (LEET[c] ?? c)))
  return { chars, leetI, leetL }
}

function startsWithAt(chars: string[], word: string, at: number): boolean {
  if (at + word.length > chars.length) return false
  for (let j = 0; j < word.length; j++) if (chars[at + j] !== word[j]) return false
  return true
}

/** Length of the keyboard / alphabet run starting at `at` (1 when there is none). */
function sequenceRun(chars: string[], at: number): number {
  let best = 1
  for (const { forward, backward } of SEQ_PAIRS) {
    for (const pairs of [forward, backward]) {
      let n = 1
      while (at + n < chars.length && pairs.has(chars[at + n - 1] + chars[at + n])) n++
      if (n > best) best = n
    }
  }
  return best >= 3 ? best : 1
}

/** Characters from `at` that repeat the block just before it (abcabc, aaaa), or 0. */
function repeatRun(chars: string[], at: number): number {
  let best = 0
  for (let k = 1; k <= at; k++) {
    let n = 0
    while (at + n < chars.length && chars[at + n] === chars[at - k + (n % k)]) n++
    // Whole copies only for blocks longer than one character.
    const covered = k === 1 ? n : n - (n % k)
    if (covered >= 2 && covered > best) best = covered
  }
  return best
}

/**
 * How many unpredictable pieces the password is made of: every common
 * password word (also through look-alikes), keyboard or alphabet run of
 * three or more, repeat of what came just before, and 19xx / 20xx year
 * counts as ONE unit; every other character as one unit each.
 * "Password2026!" → password · 2026 · ! = 3 units; a random 16-character
 * password → 16.
 */
export function predictableUnits(password: string): number {
  const { chars, leetI, leetL } = readings(password)
  let units = 0
  let i = 0
  while (i < chars.length) {
    let step = 1
    for (const w of WORDS_BY_LENGTH) {
      if (w.length <= step) break
      if (startsWithAt(chars, w, i) || startsWithAt(leetI, w, i) || startsWithAt(leetL, w, i)) {
        step = w.length
        break
      }
    }
    step = Math.max(step, sequenceRun(chars, i), repeatRun(chars, i))
    if (/^(19|20)\d\d$/.test(chars.slice(i, i + 4).join(''))) step = Math.max(step, 4)
    units += 1
    i += step
  }
  return units
}

/** Letters and digits only, lower case ("Lucian-Dev" → "luciandev"). */
function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * The account's own words a password must not contain: the e-mail's local
 * part (and its parts of four or more characters, "li.yanpei" → "yanpei")
 * and the site's name from its host ("lucian-dev.com" → "luciandev",
 * "lucian"). Pieces shorter than three / four characters are left out so a
 * short name cannot rule out half the alphabet.
 */
export function personalTokens(
  email: string | null | undefined,
  siteHost: string | null | undefined
): string[] {
  const out = new Set<string>()
  const add = (whole: string) => {
    const c = compact(whole)
    if (c.length >= 3) out.add(c)
    for (const part of whole.split(/[^A-Za-z0-9]+/)) {
      const p = compact(part)
      if (p.length >= 4) out.add(p)
    }
  }
  const local = String(email || '').split('@')[0] || ''
  if (local) add(local)
  const host = String(siteHost || '')
    .toLowerCase()
    .replace(/^www\./, '')
  // Not an IP address or a single-label host such as localhost.
  if (host.includes('.') && !/^[\d.]+$/.test(host) && !host.includes(':')) {
    const labels = host.split('.')
    add(labels.slice(0, -1).join('.'))
  }
  return Array.from(out)
}

/** True when the password contains one of `tokens` (also through look-alikes, ignoring separators). */
export function containsPersonal(password: string, tokens: readonly string[]): boolean {
  if (!tokens.length) return false
  const { chars, leetI, leetL } = readings(password)
  const forms = [chars, leetI, leetL].map((r) => compact(r.join('')))
  return tokens.some((t) => forms.some((f) => f.includes(t)))
}

export type PasswordStrength = 'none' | 'too-weak' | 'fair' | 'good' | 'strong'

export type PasswordCheck = {
  /** Code points after normalisation. */
  length: number
  tooShort: boolean
  tooLong: boolean
  /** Built from common words, runs or repeats (see predictableUnits). */
  predictable: boolean
  /** Contains the e-mail's name or the site's name. */
  personal: boolean
  /** Equal to the current password (null while that is unknown or empty). */
  sameAsCurrent: boolean | null
  /** Every rule passes (sameAsCurrent counts only when known). */
  ok: boolean
  strength: PasswordStrength
}

export type PasswordContext = {
  email?: string | null
  siteHost?: string | null
  /** The current password as typed, when known (the new one must differ). */
  current?: string | null
}

/** Rough entropy estimate: unpredictable units × log2 of the character pool used. */
function estimateBits(password: string, units: number): number {
  const s = normalizePassword(password)
  let pool = 0
  if (/[a-z]/.test(s)) pool += 26
  if (/[A-Z]/.test(s)) pool += 26
  if (/[0-9]/.test(s)) pool += 10
  if (/[ -/:-@[-`{-~]/.test(s)) pool += 33
  if (Array.from(s).some((c) => (c.codePointAt(0) ?? 0) > 0x7f)) pool += 100
  return units * Math.log2(Math.max(pool, 2))
}

export function checkNewPassword(password: string, ctx: PasswordContext = {}): PasswordCheck {
  const length = passwordLength(password)
  const tooShort = length < PASSWORD_MIN_LENGTH
  const tooLong = length > PASSWORD_MAX_LENGTH
  // Long inputs are refused anyway: skip the scan rather than spend time on them.
  const units = tooLong ? 0 : predictableUnits(password)
  const predictable = length > 0 && !tooLong && units < MIN_UNITS
  const personal =
    length > 0 && !tooLong && containsPersonal(password, personalTokens(ctx.email, ctx.siteHost))
  const current = typeof ctx.current === 'string' && ctx.current.length ? ctx.current : null
  const sameAsCurrent =
    current === null ? null : normalizePassword(current) === normalizePassword(password)
  const ok =
    length > 0 && !tooShort && !tooLong && !predictable && !personal && sameAsCurrent !== true
  let strength: PasswordStrength = 'none'
  if (length > 0) {
    if (tooShort || tooLong || predictable || personal) strength = 'too-weak'
    else {
      const bits = estimateBits(password, units)
      strength = bits < 50 ? 'fair' : bits < 72 ? 'good' : 'strong'
    }
  }
  return { length, tooShort, tooLong, predictable, personal, sameAsCurrent, ok, strength }
}

export const PASSWORD_ISSUE_MESSAGES = {
  tooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  tooLong: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  personal: 'Leave your e-mail name and the site’s name out of the password.',
  predictable:
    'That password is too common or predictable. Use a longer passphrase, or let a password manager create one.',
  sameAsCurrent: 'Choose a password different from the current one.',
} as const

export type PasswordIssue = keyof typeof PASSWORD_ISSUE_MESSAGES

/** The rules a password breaks, most fundamental first (sameAsCurrent only when known). */
export function passwordIssues(check: PasswordCheck): PasswordIssue[] {
  const out: PasswordIssue[] = []
  if (check.tooShort) out.push('tooShort')
  if (check.tooLong) out.push('tooLong')
  if (check.personal) out.push('personal')
  if (check.predictable) out.push('predictable')
  if (check.sameAsCurrent) out.push('sameAsCurrent')
  return out
}
