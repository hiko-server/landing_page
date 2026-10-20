/**
 * analytics.db migrations, oldest first (rules: scripts/db/migrate.mjs).
 * Append new files here; never edit or reorder a released one.
 */
import baseline from './001-baseline.mjs'
import vitalsKey from './002-vitals-key.mjs'
import errors from './003-errors.mjs'
import restoreDrills from './004-restore-drills.mjs'
import vitalsAttribution from './005-vitals-attribution.mjs'

/** @type {readonly import('../migrate.mjs').Migration[]} */
export const ANALYTICS_MIGRATIONS = Object.freeze([baseline, vitalsKey, errors, restoreDrills, vitalsAttribution])
