/**
 * Name of the non-secret, non-httpOnly "admin hint" cookie (`<name>=1`).
 *
 * It only tells public pages that probing /api/admin/session is worthwhile
 * (and the analytics ingester to skip the owner); it grants nothing. The
 * session itself lives in the httpOnly cookie checked by lib/auth.ts.
 *
 * Dependency-free so client components, the proxy (proxy.ts) and Node API
 * routes can all import the same constant.
 */
export const ADMIN_HINT_COOKIE = 'cv_admin_hint'
