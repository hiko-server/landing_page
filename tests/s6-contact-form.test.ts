import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MESSAGE_MAX, isContactValid, submitHint, validateContact, visibleErrors, type ContactValues } from '../components/Common/contactForm'

const ok: ContactValues = { name: 'Ada', email: 'ada@example.com', reason: 'Hiring', subject: '', message: 'Hello', mathAnswer: '7' }

test('a complete form is valid; the reason stands in for a blank subject', () => {
  const e = validateContact(ok, 7)
  assert.deepEqual(e, {})
  assert.equal(isContactValid(e), true)
  assert.equal(submitHint(e), '')
})

test('each field reports its own problem', () => {
  const e = validateContact({ ...ok, name: ' ', email: 'ada@', reason: '', message: '', mathAnswer: '8' }, 7)
  assert.ok(e.name && e.email && e.subject && e.message && e.mathAnswer)
  assert.equal(isContactValid(e), false)
  assert.match(validateContact({ ...ok, message: 'x'.repeat(MESSAGE_MAX + 1) }, 7).message || '', /under/)
})

test('the email rule matches the API (no spaces, needs a dot after @)', () => {
  assert.ok(validateContact({ ...ok, email: 'a b@c.d' }, 7).email)
  assert.ok(validateContact({ ...ok, email: 'a@b' }, 7).email)
  assert.equal(validateContact({ ...ok, email: ' a@b.co ' }, 7).email, undefined)
})

test('the form cannot be valid before the human check exists', () => {
  assert.ok(validateContact(ok, null).mathAnswer)
})

test('the submit hint lists what is missing in visual order', () => {
  assert.equal(submitHint(validateContact({ ...ok, name: '' }, 7)), 'Add your name to send.')
  assert.equal(
    submitHint(validateContact({ ...ok, name: '', message: '', mathAnswer: '' }, 7)),
    'Add your name, a message and the human-check answer to send.',
  )
})

test('errors show for touched fields, or all after a send attempt', () => {
  const e = validateContact({ ...ok, name: '', email: '' }, 7)
  assert.deepEqual(Object.keys(visibleErrors(e, { email: true }, false)), ['email'])
  assert.deepEqual(Object.keys(visibleErrors(e, {}, true)), ['name', 'email'])
})
