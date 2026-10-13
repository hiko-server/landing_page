import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOGIN_HREF, interpretAdminRead, interpretSave } from '../components/Admin/cvStudio/cvApi'

const full = { en: [{ sessionName: 'education', educationExperience: [{ gpa: '3.6', hiddenFields: ['gpa'] }] }], zh: [] }

test('admin read accepts only the admin view', () => {
  const ok = interpretAdminRead(200, 'admin', '"123"', full)
  assert.equal(ok.kind, 'ok')
  if (ok.kind === 'ok') {
    assert.equal(ok.etag, '"123"')
    assert.deepEqual(ok.doc, full)
  }
  // A pruned public copy must never reach the editor.
  assert.deepEqual(interpretAdminRead(200, 'public', '"123"', full), { kind: 'unauthorized' })
  // e.g. a redirect to the login page answered with HTML
  assert.deepEqual(interpretAdminRead(200, null, null, undefined), { kind: 'unauthorized' })
  assert.deepEqual(interpretAdminRead(401, null, null, undefined), { kind: 'unauthorized' })
  assert.equal(interpretAdminRead(500, null, null, undefined).kind, 'error')
  assert.equal(interpretAdminRead(200, 'admin', '"1"', { en: [{ nope: 1 }] }).kind, 'error')
  const noRow = interpretAdminRead(200, 'Admin', '"0"', {})
  assert.equal(noRow.kind, 'ok')
})

test('save outcomes', () => {
  assert.deepEqual(interpretSave(200, '"9"', { ok: true, etag: '"10"' }), { kind: 'ok', etag: '"10"', warning: undefined })
  assert.deepEqual(interpretSave(200, '"9"', { ok: true }), { kind: 'ok', etag: '"9"', warning: undefined })
  assert.deepEqual(interpretSave(200, null, { ok: true, r2Warning: 'R2 sync failed' }), { kind: 'ok', etag: null, warning: 'R2 sync failed' })
  assert.deepEqual(interpretSave(409, null, { error: 'conflict', message: 'changed', etag: '"11"' }), {
    kind: 'conflict',
    etag: '"11"',
    message: 'changed',
  })
  assert.deepEqual(interpretSave(401, null, { error: 'Unauthorized' }), { kind: 'unauthorized' })
  assert.deepEqual(interpretSave(400, null, { error: 'Missing payload' }), { kind: 'error', error: 'Missing payload' })
  assert.deepEqual(interpretSave(502, null, undefined), { kind: 'error', error: 'Save failed (502)' })
})

test('sign-in link returns to the CV tab', () => {
  assert.equal(decodeURIComponent(LOGIN_HREF.split('next=')[1]), '/admin/dashboard?tab=cv')
})

test('a 422 INVALID_CV save carries the validation errors', () => {
  const body = {
    code: 'INVALID_CV',
    error: 'The CV has an invalid value; nothing was saved.',
    errors: [
      { path: ['en', 2, 'experiences', 0, 'relatedSkills'], message: 'Skills must be a list of text items.' },
      { path: ['xx', 0], message: 'dropped: unknown language' },
      { message: 'dropped: no path' },
    ],
  }
  assert.deepEqual(interpretSave(422, null, body), {
    kind: 'invalid',
    error: body.error,
    errors: [body.errors[0]],
  })
  // A 422 from something else stays a plain error.
  assert.deepEqual(interpretSave(422, null, { error: 'Nope' }), { kind: 'error', error: 'Nope' })
})
