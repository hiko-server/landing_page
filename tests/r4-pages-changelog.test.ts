import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { escapeMdx, groupMarkdown, parseChangelog } from '../lib/changelog'

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

test('the real CHANGELOG.md parses into dated releases with Added / Fixed groups', () => {
  const releases = parseChangelog(changelog)
  const byVersion = new Map(releases.map((r) => [r.version, r]))
  for (const [version, date] of [
    ['2.1.0', '2026-10-13'],
    ['2.0.0', '2026-10-12'],
  ]) {
    const r = byVersion.get(version)
    assert.ok(r, `release ${version}`)
    assert.equal(r.date, date)
    const titles = r.groups.map((g) => g.title)
    assert.ok(titles.includes('Added'), `${version} has Added`)
    assert.ok(titles.includes('Fixed'), `${version} has Fixed`)
    for (const g of r.groups) assert.ok(g.items.length > 0, `${version} ${g.title} has bullets`)
  }
  // Unreleased and the undated archive headings are not releases.
  assert.ok(
    releases.every((r) => /^\d+\.\d+\.\d+$/.test(r.version) && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
  )
  // Newest first, as in the file.
  assert.ok(
    releases.findIndex((r) => r.version === '2.1.0') <
      releases.findIndex((r) => r.version === '2.0.0')
  )
  // The intro paragraph of 2.1.0 is kept, unwrapped.
  assert.match(byVersion.get('2.1.0')!.intro, /^Hardening and polish on top of 2\.0\.0/)
  assert.ok(!byVersion.get('2.1.0')!.intro.includes('\n'))
})

test('wrapped bullets stay one item; nested lists and markdown survive', () => {
  const md = [
    '## [Unreleased]',
    '- not a release',
    '',
    '## [3.0.0] – 2027-01-02',
    '',
    'Intro line one',
    'and two.',
    '',
    '### Added',
    '',
    '- **Bold** thing with `code`,',
    '  wrapped onto a second line.',
    '  - nested point',
    '- Second item',
    '',
    '### Fixed',
    '* Star bullet',
    '',
    '## Earlier',
    '- ignored',
  ].join('\n')
  const [r, ...rest] = parseChangelog(md)
  assert.equal(rest.length, 0)
  assert.equal(r.version, '3.0.0')
  assert.equal(r.date, '2027-01-02')
  assert.equal(r.intro, 'Intro line one and two.')
  assert.deepEqual(
    r.groups.map((g) => [g.title, g.items.length]),
    [
      ['Added', 2],
      ['Fixed', 1],
    ]
  )
  assert.equal(
    r.groups[0].items[0],
    '**Bold** thing with `code`,\nwrapped onto a second line.\n- nested point'
  )
  assert.equal(
    groupMarkdown(r.groups[0].items),
    '- **Bold** thing with `code`,\n  wrapped onto a second line.\n  - nested point\n- Second item'
  )
})

test('MDX-significant characters are escaped outside inline code only', () => {
  assert.equal(escapeMdx('a <b> {c} `<keep {this}>` d'), 'a \\<b> \\{c\\} `<keep {this}>` d')
  assert.equal(escapeMdx('plain text'), 'plain text')
})
