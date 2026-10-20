/**
 * G1 (/contact) — the contact page is statically generated: getStaticProps
 * only (no per-request data), a time-based window on top of the on-demand
 * regeneration every home write triggers, a 1 s window for the copy built
 * without a content store, and the retention period for the privacy notice.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CONTACT_RETENTION_DAYS', 'NEXT_PHASE']) delete process.env[k]

const prevCwd = process.cwd()
const pageSource = fs.readFileSync(path.join(prevCwd, 'pages/contact/index.tsx'), 'utf8')
let tmp = ''
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csc-contact-isr-'))
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
})
after(async () => {
  const { closeDb } = await import('../lib/db')
  closeDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('the page exports getStaticProps (from lib/contactPage) and no getServerSideProps', () => {
  assert.match(pageSource, /export const getStaticProps\b/)
  assert.doesNotMatch(pageSource, /getServerSideProps/)
  assert.match(pageSource, /loadContactPage\('en'\)/)
})

test('/contact props: the public home slice, availability, retention; a time window and the build guard', async () => {
  const { loadContactPage, CONTACT_REVALIDATE_SECONDS } = await import('../lib/contactPage')
  const empty = await loadContactPage()
  assert.equal(empty.props.home, null, 'an empty store renders the built-in defaults')
  assert.equal(empty.props.availability, null)

  const { putKv } = await import('../lib/contentStore')
  await putKv('home', {
    hero: { welcome: '', brand: 'B', tagline: '', avatarUrl: '/uploads/me.webp', email: 'hi@example.com' },
    socials: {},
    brands: [],
    quickAccess: [],
    contact: { reasons: ['Recruiting'], intents: { Recruiting: 'role' } },
    availability: { status: 'open', workStatus: 'Line' },
  })
  const r = await loadContactPage()
  assert.equal(CONTACT_REVALIDATE_SECONDS, 300)
  assert.equal(r.revalidate, 300)
  assert.equal(r.props.retentionDays, 365)
  assert.deepEqual(r.props.home?.contact, { reasons: ['Recruiting'], intents: { Recruiting: 'role' } })
  assert.equal(r.props.availability?.workStatus, 'Line')
  assert.equal(r.props.home?.hero.email, 'hi@example.com')
  assert.ok(!('avatarUrl' in (r.props.home?.hero || {})), 'only what the page renders')
  assert.match(String(r.props.vcardQr), /^<svg/)
  assert.equal(JSON.stringify(r.props).includes('undefined'), false)

  process.env.CONTACT_RETENTION_DAYS = '30'
  process.env.NEXT_PHASE = 'phase-production-build'
  try {
    const built = await loadContactPage()
    assert.equal(built.revalidate, 1, 'the build-time copy is replaced on the first request after boot')
    assert.equal(built.props.retentionDays, 30)
  } finally {
    delete process.env.CONTACT_RETENTION_DAYS
    delete process.env.NEXT_PHASE
  }
})
