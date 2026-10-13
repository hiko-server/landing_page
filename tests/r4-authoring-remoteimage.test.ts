/**
 * Remote image import (E6) refuses anything that is not a public https
 * image host — before any connection is made (resolver injected).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRemoteImageUrl, fetchRemoteImage, RemoteImageError } from '../lib/remoteImage'

const neverResolve = async (): Promise<string[]> => {
  throw new Error('resolver must not be called')
}

async function rejectsWith(url: string, code: string, resolve: (h: string) => Promise<string[]> = neverResolve) {
  await assert.rejects(fetchRemoteImage(url, { resolve }), (err: unknown) => {
    assert.ok(err instanceof RemoteImageError, String(err))
    assert.equal(err.code, code)
    return true
  })
}

test('IP-literal URLs are refused (v4, v6 and integer forms)', async () => {
  await rejectsWith('https://127.0.0.1/x.png', 'BLOCKED_HOST')
  await rejectsWith('https://[::1]/x.png', 'BLOCKED_HOST')
  await rejectsWith('https://2130706433/x.png', 'BLOCKED_HOST')
  await rejectsWith('https://93.184.216.34/x.png', 'BLOCKED_HOST')
})

test('only https is accepted', async () => {
  await rejectsWith('http://example.com/x.png', 'BAD_URL')
  await rejectsWith('ftp://example.com/x.png', 'BAD_URL')
  await rejectsWith('file:///etc/passwd', 'BAD_URL')
  await rejectsWith('not a url', 'BAD_URL')
  await rejectsWith('https://user:pw@example.com/x.png', 'BAD_URL')
})

test('a hostname resolving to a private address is refused', async () => {
  await rejectsWith('https://images.example.test/x.png', 'BLOCKED_HOST', async () => ['10.0.0.1'])
  await rejectsWith('https://mixed.example.test/x.png', 'BLOCKED_HOST', async () => ['93.184.216.34', '169.254.169.254'])
  await rejectsWith('https://localhost/x.png', 'BLOCKED_HOST')
})

test('checkRemoteImageUrl accepts a public https URL without touching the network', () => {
  assert.equal(checkRemoteImageUrl(' https://cdn.example.com/a.png ').hostname, 'cdn.example.com')
})
