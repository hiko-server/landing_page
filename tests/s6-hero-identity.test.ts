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
  assert.equal(portraitAlt({ name: '', nameZh: '', nick: '' }), 'Portrait')
})
