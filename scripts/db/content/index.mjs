/**
 * content.db migrations, oldest first (rules: scripts/db/migrate.mjs).
 * Append new files here; never edit or reorder a released one.
 */
import baseline from './001-baseline.mjs'
import editorial from './002-editorial.mjs'
import mediaLibrary from './003-media-library.mjs'

/** @type {readonly import('../migrate.mjs').Migration[]} */
export const CONTENT_MIGRATIONS = Object.freeze([baseline, editorial, mediaLibrary])
