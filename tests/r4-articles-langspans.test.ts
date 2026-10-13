/** Language-of-parts spans (C3 / WCAG 3.1.2). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import rehypeLangSpans, { foreignRuns, splitByScript } from '../lib/rehype/langSpans'
import type { HastNode } from '../lib/rehype/hast'

const text = (value: string): HastNode => ({ type: 'text', value })
const el = (tagName: string, properties: Record<string, unknown>, children: HastNode[] = []): HastNode => ({ type: 'element', tagName, properties, children })

test('a Han run in an English article is wrapped in lang="zh-Hans"', () => {
  const tree: HastNode = { type: 'root', children: [el('h2', {}, [text('这是什么 · What it is')])] }
  rehypeLangSpans({ lang: 'en' })(tree)
  const h2 = tree.children![0]
  assert.deepEqual(h2.children, [el('span', { lang: 'zh-Hans' }, [text('这是什么')]), text(' · What it is')])
})

test('a single Han character is not wrapped', () => {
  assert.deepEqual(splitByScript('The 车 icon', 'han', 'zh-Hans'), [{ text: 'The 车 icon' }])
  const tree: HastNode = { type: 'root', children: [el('p', {}, [text('Only 我 here')])] }
  rehypeLangSpans({ lang: 'en' })(tree)
  assert.deepEqual(tree.children![0].children, [text('Only 我 here')])
})

test('code, pre and explicit-lang subtrees are untouched', () => {
  const code = el('code', {}, [text('const 名字 = "中文"')])
  const pre = el('pre', {}, [el('code', {}, [text('中文代码')])])
  const tagged = el('span', { lang: 'ja' }, [text('日本語です')])
  const tree: HastNode = { type: 'root', children: [el('p', {}, [code]), pre, el('p', {}, [tagged])] }
  const before = JSON.stringify(tree)
  rehypeLangSpans({ lang: 'en' })(tree)
  assert.equal(JSON.stringify(tree), before)
})

test('Latin runs of two or more words are tagged in a Chinese article', () => {
  const tree: HastNode = { type: 'root', children: [el('p', {}, [text('Car Boy 是一个社区，API 很简单。')])] }
  rehypeLangSpans({ lang: 'zh-Hans' })(tree)
  assert.deepEqual(tree.children![0].children, [el('span', { lang: 'en' }, [text('Car Boy')]), text(' 是一个社区，API 很简单。')])
})

test('CJK punctuation joins a Han run; other languages are left alone', () => {
  assert.deepEqual(splitByScript('He said 你好，世界。 then left', 'han', 'zh-Hans'), [
    { text: 'He said ' },
    { text: '你好，世界。', lang: 'zh-Hans' },
    { text: ' then left' },
  ])
  assert.deepEqual(foreignRuns('en-GB'), { kind: 'han', lang: 'zh-Hans' })
  assert.deepEqual(foreignRuns('zh-Hant'), { kind: 'latin', lang: 'en' })
  assert.equal(foreignRuns('ja'), null)
  const tree: HastNode = { type: 'root', children: [el('p', {}, [text('漢字 English words')])] }
  const before = JSON.stringify(tree)
  rehypeLangSpans({ lang: 'ja' })(tree)
  assert.equal(JSON.stringify(tree), before)
})
