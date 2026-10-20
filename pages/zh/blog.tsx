import type { GetStaticProps } from 'next'
import BlogIndex, { type Props } from '../blog'

/**
 * /zh/blog — the posts in Chinese (F3): a Chinese post, or the Chinese
 * version of a piece published in several languages, with the page in
 * Chinese (lib/uiStrings/lists) and <html lang="zh-Hans">. It exists only
 * while a Chinese post is published (404 otherwise); /blog ⇄ /zh/blog carry
 * reciprocal hreflang alternates and the header's language switch.
 * Statically generated (ISR, lib/indexPages).
 */
export default BlogIndex

export const getStaticProps: GetStaticProps<Props> = async () => (await import('../../lib/indexPages')).loadBlogIndex('zh-Hans')
