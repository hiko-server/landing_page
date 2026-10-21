/**
 * The Password card's checklist and wait labels (pure — unit tested). Kept
 * apart from securityFormat, which other admin pages import too.
 */
import type { PasswordCheck } from '../../../lib/adminAuth/passwordPolicy'

export type PasswordRule = { key: string; label: string; state: 'met' | 'unmet' | 'pending' }

/**
 * The checklist under a new password (the same rules the server applies,
 * lib/adminAuth/passwordPolicy): "pending" while nothing is typed — and for
 * "different from the current one" until the current password is typed too.
 */
export function passwordRules(
  check: PasswordCheck,
  minLength: number,
  maxLength: number
): PasswordRule[] {
  const empty = check.length === 0
  const state = (ok: boolean): PasswordRule['state'] => (empty ? 'pending' : ok ? 'met' : 'unmet')
  return [
    {
      key: 'length',
      label: check.tooLong
        ? `At most ${maxLength} characters (${check.length})`
        : `At least ${minLength} characters${empty ? '' : ` (${check.length})`}`,
      state: state(!check.tooShort && !check.tooLong),
    },
    {
      key: 'common',
      label: 'Not a common or predictable password',
      state: state(!check.predictable),
    },
    {
      key: 'personal',
      label: 'Leaves out your e-mail name and the site’s name',
      state: state(!check.personal),
    },
    {
      key: 'current',
      label: 'Different from your current password',
      state:
        empty || check.sameAsCurrent === null ? 'pending' : check.sameAsCurrent ? 'unmet' : 'met',
    },
  ]
}

/** "4 min", "1 h 5 min" from `now` until `until` (at least 1 min) — a wait after too many attempts. */
export function waitLabel(until: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}
