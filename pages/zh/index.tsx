import type { GetStaticProps } from 'next'
import LandingPage, { type Props } from '../index'

/**
 * /zh — the home page in Chinese (F3): the owner's Chinese tagline and copy
 * (Home editor → 中文), the Chinese CV, the posts and case studies in
 * Chinese and the interface in Chinese (lib/uiStrings/home), <html
 * lang="zh-Hans">. It exists only while the Chinese tagline is written (404
 * otherwise); / ⇄ /zh carry reciprocal hreflang alternates and the header's
 * language switch. Statically generated (ISR, lib/homePage).
 */
export default LandingPage

export const getStaticProps: GetStaticProps<Props> = async () => (await import('../../lib/homePage')).loadHomePage('zh-Hans')
