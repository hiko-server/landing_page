import type { GetStaticProps } from 'next'
import Contact, { type Props } from '../contact'

/**
 * /zh/contact — the contact page in Chinese (F3): the owner's Chinese
 * heading, blurb, eyebrow, reasons and availability lines (Home editor →
 * 中文), the form, its checks and its privacy notice in Chinese
 * (lib/uiStrings/contact), <html lang="zh-Hans">. It exists only while the
 * owner has written the Chinese heading or blurb (404 otherwise); /contact ⇄
 * /zh/contact carry reciprocal hreflang alternates and the header's
 * language switch. Statically generated (ISR, lib/contactPage).
 */
export default Contact

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { loadContactPage } = await import('../../lib/contactPage')
  return loadContactPage('zh-Hans')
}
