/**
 * User-facing copy for the admin auth endpoints.
 *
 * Messages are deliberately generic: sign-in never reveals whether the email
 * exists, and a lockout reads the same whether the per-IP limiter or the
 * per-account lock tripped, so the UI can't be used to probe either.
 */

export const NETWORK_ERROR = 'Couldn’t reach the server. Check your connection and try again.'

const THROTTLED = 'Too many attempts. Wait a few minutes, then try again.'
const SERVER = 'The server couldn’t complete the request. Try again shortly.'

export function loginErrorMessage(status: number): string {
  if (status === 401) return 'That email and password don’t match. Check both and try again.'
  if (status === 429 || status === 423) return THROTTLED
  if (status === 403)
    return 'Sign-in was blocked by a security check. Reload the page and try again.'
  if (status === 400) return 'Enter your email address and password.'
  if (status >= 500) return SERVER
  return `Sign-in failed (HTTP ${status}).`
}

export function resetRequestErrorMessage(status: number): string {
  if (status === 429) return THROTTLED
  if (status === 400) return 'Enter a valid email address.'
  if (status >= 500) return SERVER
  return `Request failed (HTTP ${status}).`
}

export function resetPasswordErrorMessage(status: number, serverError?: unknown): string {
  if (status === 429) return THROTTLED
  if (status === 400) {
    if (typeof serverError === 'string' && /password/i.test(serverError))
      return 'Use a password between 12 and 1024 characters.'
    return 'This reset link is invalid or has expired. Request a new one.'
  }
  if (status >= 500) return SERVER
  return `Reset failed (HTTP ${status}).`
}
