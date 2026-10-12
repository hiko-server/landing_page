import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventAction, eventKind, relativeTime, repoUrl } from '../components/Common/githubEvents'

test('repo links only for well-formed owner/repo names', () => {
  assert.equal(repoUrl('HikoPLi/landing_page'), 'https://github.com/HikoPLi/landing_page')
  assert.equal(repoUrl('javascript:alert(1)'), '')
  assert.equal(repoUrl('a/b/c'), '')
  assert.equal(repoUrl(undefined), '')
})

test('event phrases', () => {
  assert.equal(eventAction({ id: '1', type: 'PushEvent', created_at: '', payload: { size: 3 } }), 'Pushed 3 commits to')
  assert.equal(eventAction({ id: '1', type: 'PushEvent', created_at: '', payload: { size: 1 } }), 'Pushed 1 commit to')
  assert.equal(eventAction({ id: '1', type: 'PushEvent', created_at: '' }), 'Pushed to')
  assert.equal(eventAction({ id: '1', type: 'PullRequestEvent', created_at: '', payload: { action: 'opened', number: 4 } }), 'Opened PR #4 in')
  assert.equal(eventAction({ id: '1', type: 'IssuesEvent', created_at: '', payload: { action: 'closed', issue: { number: 9 } } }), 'Closed issue #9 in')
  assert.equal(eventAction({ id: '1', type: 'CreateEvent', created_at: '', payload: { ref_type: 'repository' } }), 'Created repository')
  assert.equal(eventAction({ id: '1', type: 'PullRequestReviewEvent', created_at: '' }), 'Pull request review in')
  assert.equal(eventKind('RepoUpdateEvent'), 'repo')
  assert.equal(eventKind('GollumEvent'), 'other')
})

test('relative time', () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  assert.equal(relativeTime('2026-10-12T11:59:30Z', now), 'just now')
  assert.equal(relativeTime('2026-10-12T11:55:00Z', now), '5m ago')
  assert.equal(relativeTime('2026-10-12T09:00:00Z', now), '3h ago')
  assert.equal(relativeTime('2026-10-10T12:00:00Z', now), '2d ago')
  assert.equal(relativeTime('2026-01-02T12:00:00Z', now), 'Jan 2, 2026')
  assert.equal(relativeTime('nonsense', now), '')
})
