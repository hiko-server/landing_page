/**
 * auth.db migrations, oldest first (rules: scripts/db/migrate.mjs).
 * Append new files here; never edit or reorder a released one.
 */
import passkeysSessions from './001-passkeys-sessions.mjs'
import failureCounts from './002-failure-counts.mjs'
import reviewLinks from './003-review-links.mjs'
import cvShareLinks from './004-cv-share-links.mjs'

/** @type {readonly import('../migrate.mjs').Migration[]} */
export const AUTH_MIGRATIONS = Object.freeze([passkeysSessions, failureCounts, reviewLinks, cvShareLinks])
