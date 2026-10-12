import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import {
  FALLBACK_NAME,
  FALLBACK_NAME_ZH,
  FALLBACK_ROLE,
  heroCopy,
  heroIdentity,
  joinName,
  portraitAlt,
  taglinePhrases,
} from '../components/LandingPage/heroIdentity'

const pi = (extra: Record<string, unknown> = {}) => ({
  sessionName: 'personalInformation',
  firstName: 'Yanpei',
  lastName: 'Li',
  nickName: 'Lucian',
  ...extra,
})
const piZh = (extra: Record<string, unknown> = {}) => ({ sessionName: 'personalInformation', firstName: '彦霈', lastName: '李', nickName: 'Lucian', ...extra })
const prune = (s: Record<string, unknown>) => publicSections([s], 'website')[0]

test('names come from the CV: surname-first EN, no space for CJK', () => {
  assert.deepEqual(heroIdentity(pi(), piZh()), { name: 'Li Yanpei', nameZh: '李彦霈', nick: 'Lucian' })
  assert.equal(joinName('李', '彦霈'), '李彦霈')
  assert.equal(joinName('Li', 'Yanpei'), 'Li Yanpei')
  assert.equal(joinName('', 'Yanpei'), 'Yanpei')
})

test('literals are used only when the CV carries no name', () => {
  assert.deepEqual(heroIdentity(undefined, undefined), { name: FALLBACK_NAME, nameZh: FALLBACK_NAME_ZH, nick: 'Lucian' })
  const blank = heroIdentity(pi({ firstName: '', lastName: '', nickName: '' }), piZh({ firstName: ' ', lastName: '' }))
  assert.equal(blank.name, FALLBACK_NAME)
  assert.equal(blank.nameZh, FALLBACK_NAME_ZH)
  assert.equal(blank.nick, '')
})

test('hidden name fields are respected on pruned and editor documents', () => {
  const pruned = heroIdentity(prune(pi({ hiddenFields: ['lastName', 'nickName'] })), prune(piZh({ hiddenFields: ['firstName', 'lastName'] })))
  assert.deepEqual(pruned, { name: 'Yanpei', nameZh: '', nick: '' })
  const allHidden = heroIdentity(pi({ hiddenFields: ['firstName', 'lastName'] }), undefined)
  assert.equal(allHidden.name, '', 'a fully hidden name must not fall back to the literal')
  assert.equal(allHidden.nick, 'Lucian')
})

test('a Personal Info section switched off the website never brings back the literals', () => {
  // Stored CV has the section, public view has none (both languages off the website).
  assert.deepEqual(heroIdentity(undefined, undefined, { storedHasPersonalInfo: true }), { name: '', nameZh: '', nick: '' })
  // EN on the website, ZH section off: no literal 中文 name is added.
  assert.deepEqual(heroIdentity(pi(), undefined, { storedHasPersonalInfo: true }), { name: 'Li Yanpei', nameZh: '', nick: 'Lucian' })
  // ZH only on the website: the 中文 name stands alone, no EN literal.
  assert.deepEqual(heroIdentity(undefined, piZh(), { storedHasPersonalInfo: true }), { name: '', nameZh: '李彦霈', nick: '' })
  // Only a stored CV with no Personal Info at all uses the built-in identity.
  assert.deepEqual(heroIdentity(undefined, undefined, { storedHasPersonalInfo: false }), {
    name: FALLBACK_NAME,
    nameZh: FALLBACK_NAME_ZH,
    nick: 'Lucian',
  })
})

test('an EN name the owner hid cannot reappear through the 中文 or nickname literals', () => {
  const hiddenEn = prune(pi({ hiddenFields: ['firstName', 'lastName', 'nickName'] }))
  assert.deepEqual(heroIdentity(hiddenEn, undefined), { name: '', nameZh: '', nick: '' })
  assert.deepEqual(heroIdentity(hiddenEn, undefined, { storedHasPersonalInfo: true }), { name: '', nameZh: '', nick: '' })
  // A blank (not hidden) ZH name next to a hidden EN name stays blank too.
  assert.deepEqual(heroIdentity(hiddenEn, piZh({ firstName: '', lastName: '' })), { name: '', nameZh: '', nick: '' })
  // …while a 中文 name the owner left visible is still shown.
  assert.deepEqual(heroIdentity(hiddenEn, piZh()), { name: '', nameZh: '李彦霈', nick: '' })
})

test('the 中文 name and nickname are dropped when they repeat the EN name', () => {
  const id = heroIdentity(pi({ nickName: 'Li Yanpei' }), piZh({ firstName: 'Yanpei', lastName: 'Li' }))
  assert.equal(id.nameZh, '')
  assert.equal(id.nick, '')
})

test('tagline: first phrase is the role, the rest rotate; no raw pipes', () => {
  assert.deepEqual(taglinePhrases(' A |  | B| C '), ['A', 'B', 'C'])
  assert.deepEqual(heroCopy('Engineer | ML | CV'), { role: 'Engineer', rotating: ['ML', 'CV'] })
  assert.deepEqual(heroCopy(''), { role: FALLBACK_ROLE, rotating: [] })
  assert.deepEqual(heroCopy(undefined), { role: FALLBACK_ROLE, rotating: [] })
})

test('portrait alt text', () => {
  assert.equal(portraitAlt({ name: 'Li Yanpei', nameZh: '', nick: 'Lucian' }), 'Li Yanpei (Lucian)')
  assert.equal(portraitAlt({ name: '', nameZh: '', nick: 'Lucian' }), 'Lucian')
  assert.equal(portraitAlt({ name: '', nameZh: '李彦霈', nick: '' }), '李彦霈')
  assert.equal(portraitAlt({ name: '', nameZh: '', nick: '' }), 'Portrait')
})
