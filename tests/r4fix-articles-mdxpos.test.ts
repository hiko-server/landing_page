/**
 * MdxCompileError carries line/column for every parser error, including
 * mdast-util-mdx-jsx messages whose position exists only in the reason text
 * ("Expected a closing tag for `<Callout>` (3:1-3:10)").
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileMdx, MdxCompileError } from '../lib/mdx'

const opts = { resolveSize: () => null, srcSetFor: () => null }

async function errorOf(body: string): Promise<MdxCompileError> {
  try {
    await compileMdx(body, opts)
  } catch (err) {
    assert.ok(err instanceof MdxCompileError, 'MdxCompileError')
    return err
  }
  throw new Error('expected a compile error')
}

test('a flow element left open at the end of the document: position from the reason text', async () => {
  const err = await errorOf('# Title\n\n<Callout>\n\nSome text\n')
  assert.match(err.reason, /Expected a closing tag for `<Callout>`/)
  assert.equal(err.line, 3)
  assert.equal(err.column, 1)
  assert.match(err.message, /\(line 3, column 1\)$/)
})

test('a message with a place uses the place, not the position in its text', async () => {
  const err = await errorOf('Intro\n\n<Callout>\n\n</Other>\n')
  assert.match(err.reason, /\(3:1-3:10\)/)
  assert.equal(err.line, 5)
  assert.equal(err.column, 1)
})

test('a point place (unterminated expression) is used as is', async () => {
  const err = await errorOf('a {1 +\n')
  assert.equal(err.line, 1)
  assert.equal(err.column, 7)
})

test('an inline element left open: start of its place', async () => {
  const err = await errorOf('Hello <b>\n\nworld')
  assert.equal(err.line, 1)
  assert.equal(err.column, 1)
})
