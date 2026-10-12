import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidUploadName, sanitizeUploadName, UPLOAD_NAME_MAX_NEW, withHashSuffix } from '../lib/security/uploadName'
import { maskMongoUri, MASK, mongoUriSecrets, redactMongoSecrets } from '../lib/security/mongoUri'
import { isSessionCurrent, tokenSessionVersion, toSessionVersion } from '../lib/security/session'
import { clampText, OG_LIMITS, parseOgParams } from '../lib/security/ogParams'
import { createFixedWindowLimiter } from '../lib/security/rateLimitCore'

test('upload names: what is served is exactly what the sanitiser emits', () => {
  for (const ok of ['1712345678901-photo.png', 'a.b.webp', '_x.jpg', '-x.gif', 'IMG_0001.JPG']) assert.equal(isValidUploadName(ok), true, ok)
  for (const bad of ['', '.png', '..png', 'a..png', 'a/b.png', 'a\\b.png', 'a b.png', 'é.png', 'x'.repeat(256), '.', '..']) {
    assert.equal(isValidUploadName(bad), false, bad)
  }
  const cases = ['../../etc/passwd', '..', '.png', '...', '图片.png', 'my photo (1).HEIC', 'a..b..c.png', 'C:\\Users\\me\\pic.jpg', '', 'x'.repeat(400) + '.png', '.hidden']
  for (const c of cases) {
    const name = sanitizeUploadName(c, '.png')
    assert.equal(isValidUploadName(name), true, `${c} → ${name}`)
    assert.ok(name.endsWith('.png'))
    assert.ok(name.length <= UPLOAD_NAME_MAX_NEW)
    const suffixed = withHashSuffix(name, 'ABCDEF0123456789')
    assert.equal(isValidUploadName(suffixed), true, suffixed)
    assert.ok(suffixed.length <= UPLOAD_NAME_MAX_NEW)
  }
  assert.equal(sanitizeUploadName('1712-my photo.jpeg', '.jpg'), '1712-my_photo.jpg')
  assert.equal(sanitizeUploadName('../../etc/passwd', '.png'), 'passwd.png')
  assert.equal(sanitizeUploadName('...', '.png'), 'image.png')
  assert.equal(withHashSuffix('photo.png', 'abcdef0123456789'), 'photo-abcdef0123.png')
  assert.throws(() => sanitizeUploadName('x', 'png'))
})

test('mongo URIs: credentials never survive masking', () => {
  assert.equal(maskMongoUri('mongodb+srv://user:s3cret@cluster0.abc.mongodb.net/db?retryWrites=true'), `mongodb+srv://user:${MASK}@cluster0.abc.mongodb.net/db?retryWrites=true`)
  assert.equal(maskMongoUri('mongodb://u:p%40ss@h1:27017,h2:27017/db?replicaSet=rs0'), `mongodb://u:${MASK}@h1:27017,h2:27017/db?replicaSet=rs0`)
  // Unencoded "@" and "/" in the password.
  const tricky = maskMongoUri('mongodb://admin:pa@ss/w:rd@host/db')
  assert.ok(!tricky.includes('pa@ss') && !tricky.includes('w:rd'), tricky)
  // Token-only userinfo is masked whole.
  assert.equal(maskMongoUri('mongodb://tokenonly@host/'), `mongodb://${MASK}@host/`)
  // Secret query options.
  const q = maskMongoUri('mongodb://host/db?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:abc&password=zzz')
  assert.ok(!q.includes('abc') && !q.includes('zzz'), q)
  assert.ok(q.includes('authMechanism=MONGODB-AWS'))
  // "@" in the query: masks more, never less.
  const atq = maskMongoUri('mongodb://u:pw123@h/db?appName=a@b')
  assert.ok(!atq.includes('pw123'), atq)
  assert.equal(maskMongoUri('mongodb://host/db'), 'mongodb://host/db')
  assert.equal(maskMongoUri(''), '')
})

test('mongo error text is scrubbed of embedded URIs and known passwords', () => {
  const uri = 'mongodb+srv://user:hunter2%21@c.example.net/db'
  assert.deepEqual(mongoUriSecrets(uri).sort(), ['hunter2!', 'hunter2%21'].sort())
  const msg = redactMongoSecrets('failed to connect to mongodb://user:hunter2%21@h:27017/?tls=true; auth failed for password hunter2!', [uri])
  assert.ok(!msg.includes('hunter2'), msg)
  assert.ok(msg.includes('h:27017'))
})

test('session versions: legacy tokens are version 0, bumps revoke', () => {
  assert.equal(toSessionVersion(undefined), 0)
  assert.equal(toSessionVersion(-1), 0)
  assert.equal(toSessionVersion(1.5), 0)
  assert.equal(toSessionVersion('3'), 0)
  assert.equal(toSessionVersion(3), 3)
  assert.equal(tokenSessionVersion({ role: 'admin' }), 0)
  assert.equal(isSessionCurrent({ role: 'admin' }, 0), true)
  assert.equal(isSessionCurrent({ role: 'admin' }, 1), false)
  assert.equal(isSessionCurrent({ role: 'admin', sv: 2 }, 2), true)
  assert.equal(isSessionCurrent({ role: 'admin', sv: 1 }, 2), false)
  assert.equal(isSessionCurrent({ role: 'admin', sv: '2' }, 2), false)
})

test('og params are clamped by code point and sanitised', () => {
  assert.equal(clampText('  a\u0000b\n\nc  ', 10), 'a b c')
  const long = clampText('😀'.repeat(500), OG_LIMITS.title)
  assert.equal(Array.from(long).length, OG_LIMITS.title)
  assert.ok(long.endsWith('…'))
  assert.ok(!/[\uD800-\uDBFF]…$/.test(long))
  const p = parseOgParams(new URLSearchParams({ title: 'x'.repeat(1000), kind: 'Blog<script>', subtitle: 'y'.repeat(1000) }))
  assert.equal(Array.from(p.title).length, OG_LIMITS.title)
  assert.equal(Array.from(p.subtitle).length, OG_LIMITS.subtitle)
  assert.equal(p.kind, 'blogscript')
  assert.deepEqual(parseOgParams(new URLSearchParams()), { title: 'LUCIAN-DEV.COM', kind: 'page', subtitle: '' })
})

test('fixed-window limiter counts, resets and stays bounded', () => {
  const l = createFixedWindowLimiter(100)
  assert.equal(l.hit('k', 2, 1000, 0).allowed, true)
  assert.equal(l.hit('k', 2, 1000, 1).allowed, true)
  assert.equal(l.hit('k', 2, 1000, 2).allowed, false)
  assert.equal(l.hit('k', 2, 1000, 1000).allowed, true)
  for (let i = 0; i < 1000; i++) l.hit(`f${i}`, 1, 60_000, 5)
  assert.ok(l.size() <= 100)
})
