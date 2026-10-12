import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipBucket, ipInCidr, normalizeIp, parseCidr, parseCidrList, parseIp, pickClientIp } from '../lib/security/ip'

test('parses and normalises IPv4 / IPv6', () => {
  assert.equal(normalizeIp('203.0.113.9'), '203.0.113.9')
  assert.equal(normalizeIp('2001:DB8:0:0:0:0:0:1'), '2001:db8::1')
  assert.equal(normalizeIp('::1'), '::1')
  assert.equal(normalizeIp('::'), '::')
  assert.equal(normalizeIp('[2001:db8::1]'), '2001:db8::1')
  assert.equal(normalizeIp('fe80::1%eth0'), 'fe80::1')
  assert.equal(normalizeIp('2001:db8:0:1:0:0:1:1'), '2001:db8:0:1::1:1')
  assert.equal(normalizeIp('::ffff:198.51.100.7'), '198.51.100.7')
  assert.equal(normalizeIp('64:ff9b::192.0.2.33'), '64:ff9b::c000:221')
})

test('rejects malformed addresses', () => {
  for (const bad of ['', '1.2.3', '1.2.3.256', '01.2.3.4', '1.2.3.4.5', '2001:db8::1::2', '12345::', 'g::1', '1.2.3.4:80', 'localhost', 'unknown', null, 42]) {
    assert.equal(parseIp(bad), null, String(bad))
  }
})

test('CIDR parsing and matching (v4, v6, v4-mapped)', () => {
  const ten = parseCidr('10.0.0.0/8')!
  assert.equal(ipInCidr(parseIp('10.255.1.2')!, ten), true)
  assert.equal(ipInCidr(parseIp('11.0.0.1')!, ten), false)
  const docker = parseCidr('172.16.0.0/12')!
  assert.equal(ipInCidr(parseIp('172.31.255.255')!, docker), true)
  assert.equal(ipInCidr(parseIp('172.32.0.1')!, docker), false)
  const v6 = parseCidr('2001:db8::/32')!
  assert.equal(ipInCidr(parseIp('2001:db8:ffff::1')!, v6), true)
  assert.equal(ipInCidr(parseIp('2001:db9::1')!, v6), false)
  assert.equal(ipInCidr(parseIp('10.0.0.1')!, v6), false)
  const host = parseCidr('127.0.0.1')!
  assert.equal(host.prefix, 32)
  assert.equal(ipInCidr(parseIp('::ffff:127.0.0.1')!, host), true)
  assert.equal(parseCidr('::ffff:10.0.0.0/104')!.prefix, 8)
  assert.equal(parseCidr('10.0.0.0/33'), null)
  assert.equal(parseCidr('10.0.0.0/x'), null)
  assert.equal(parseCidrList(' 127.0.0.1, 10.0.0.0/8 ,bogus,, ::1/128').length, 3)
  assert.equal(ipInCidr(parseIp('1.2.3.4')!, parseCidr('0.0.0.0/0')!), true)
})

test('IPv6 clients are bucketed by /64; IPv4 verbatim', () => {
  assert.equal(ipBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64')
  assert.equal(ipBucket('2001:db8:1:2::9'), '2001:db8:1:2::/64')
  assert.equal(ipBucket('::ffff:203.0.113.5'), '203.0.113.5')
  assert.equal(ipBucket('garbage'), 'unknown')
})

test('client IP: trusted header, peer fallback and proxy allow-list', () => {
  const cf = 'cf-connecting-ip'
  assert.equal(pickClientIp({ peer: '::ffff:172.18.0.1', headerName: cf, headerValue: '203.0.113.9', trusted: [] }), '203.0.113.9')
  assert.equal(pickClientIp({ peer: '172.18.0.1', headerName: cf, headerValue: undefined, trusted: [] }), '172.18.0.1')
  assert.equal(pickClientIp({ peer: '172.18.0.1', headerName: cf, headerValue: 'not-an-ip', trusted: [] }), '172.18.0.1')
  assert.equal(pickClientIp({ peer: '172.18.0.1', headerName: cf, headerValue: '1.1.1.1, 2.2.2.2', trusted: [] }), '172.18.0.1')
  assert.equal(pickClientIp({ peer: '172.18.0.1', headerName: '', headerValue: '203.0.113.9', trusted: [] }), '172.18.0.1')
  const trusted = parseCidrList('172.16.0.0/12')
  assert.equal(pickClientIp({ peer: '172.18.0.1', headerName: cf, headerValue: '203.0.113.9', trusted }), '203.0.113.9')
  // Direct hit from outside the proxy range: header ignored.
  assert.equal(pickClientIp({ peer: '198.51.100.2', headerName: cf, headerValue: '203.0.113.9', trusted }), '198.51.100.2')
  // Edge runtime (no peer): header believed.
  assert.equal(pickClientIp({ peer: '', headerName: cf, headerValue: '203.0.113.9', trusted }), '203.0.113.9')
})

test('x-forwarded-for is read right-to-left, skipping trusted hops', () => {
  const xff = 'x-forwarded-for'
  assert.equal(pickClientIp({ peer: '127.0.0.1', headerName: xff, headerValue: '6.6.6.6, 203.0.113.9', trusted: [] }), '203.0.113.9')
  const trusted = parseCidrList('127.0.0.1,10.0.0.0/8')
  assert.equal(pickClientIp({ peer: '127.0.0.1', headerName: xff, headerValue: '6.6.6.6, 203.0.113.9, 10.0.0.5', trusted }), '203.0.113.9')
  assert.equal(pickClientIp({ peer: '127.0.0.1', headerName: xff, headerValue: '203.0.113.9:5555', trusted }), '203.0.113.9')
  assert.equal(pickClientIp({ peer: '127.0.0.1', headerName: xff, headerValue: 'junk, 203.0.113.9, nonsense', trusted }), '127.0.0.1')
})
