/**
 * audit.db migrations, oldest first (rules: scripts/db/migrate.mjs).
 * Append new files here; never edit or reorder a released one.
 */
import baseline from './001-baseline.mjs'

/** @type {readonly import('../migrate.mjs').Migration[]} */
export const AUDIT_MIGRATIONS = Object.freeze([baseline])
