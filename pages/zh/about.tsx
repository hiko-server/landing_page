import type { GetStaticProps } from 'next'
import About, { type Props } from '../about'

/**
 * /zh/about — the about page in Chinese (F3): the owner's Chinese bio
 * (About editor → 中文), the Chinese tagline's lead and focus areas, the
 * Chinese CV first and the interface in Chinese (lib/uiStrings/about),
 * <html lang="zh-Hans">. It exists only while the Chinese bio has text (404
 * otherwise); /about ⇄ /zh/about carry reciprocal hreflang alternates and
 * the header's language switch. Statically generated (ISR, lib/aboutPage).
 */
export default About

export const getStaticProps: GetStaticProps<Props> = async () => (await import('../../lib/aboutPage')).loadAboutPage('zh-Hans')
