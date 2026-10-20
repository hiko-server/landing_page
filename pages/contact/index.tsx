import React from 'react'
import type { GetStaticProps } from 'next'
import { Box } from '@chakra-ui/react'

import ContactPro from '../../components/Contact/ContactPro'
import AvailabilityCard from '../../components/Contact/AvailabilityCard'
import AskEntry from '../../components/Search/AskEntry'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import { absUrl, breadcrumb, PERSON_ID, PERSON_NAME } from '../../lib/schema'
import { ogPresetUrl } from '../../lib/og/presets'
import { fillUi } from '../../lib/uiStrings'
import { CONTACT_EN } from '../../lib/uiStrings/contact-en'
import type { ContactPageProps } from '../../lib/contactPage'

const VCARD_PATH = '/api/vcard'

export type Props = ContactPageProps

/**
 * /contact — page header, the owner's availability (when set in the Home
 * editor), "Ask Lucian" (a question answered with quotes from the site; what
 * it cannot answer goes into the form below), the reach-me panel (copyable
 * e-mail / phone, vCard download and QR) and the message form with its
 * privacy notice.
 *
 * Statically generated (ISR, lib/contactPage): nothing here depends on the
 * request, so the page is served from the cache (and the CDN) and
 * regenerated when the home document changes. Everything per-visitor stays
 * client side: the form's human-check nonce is fetched when the form comes
 * into view, drafts live in the visitor's browser.
 *
 * /zh/contact (pages/zh/contact.tsx, F3) renders this page with the owner's
 * Chinese contact copy and the interface in Chinese (`ui`,
 * lib/uiStrings/contact); it exists only while that copy is written.
 */
const Contact = ({ home, availability, vcardQr, retentionDays, ui, reasonOptions, lang, alternates, nameZh, chromeZh }: Props) => {
  const t = ui?.t ?? CONTACT_EN
  const zh = lang !== 'en'
  const path = zh ? '/zh/contact' : '/contact'
  const lede = (home?.contact?.blurb ?? '').trim() || t.page.fallbackLede
  const owner = zh && nameZh ? `${nameZh}（Lucian）` : PERSON_NAME
  // The breadcrumb's home: /zh when it exists (lib/zhSite), else the English home page.
  const homePath = zh && chromeZh?.includes('/') ? '/zh' : '/'
  // The form's right-to-work line on a Chinese page: the owner's Chinese one, else the English one (marked).
  const formAvailability =
    zh && availability
      ? { ...availability, workStatus: availability.workStatus_zh || availability.workStatus, workStatusLang: availability.workStatus_zh ? undefined : 'en' }
      : availability

  return (
    <React.Fragment>
      <CustomHead
        title={t.page.title}
        description={fillUi(t.page.description, { name: owner })}
        url={absUrl(path)}
        image={ogPresetUrl('contact')}
        lang={lang}
        nameZh={nameZh}
        alternates={alternates}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'ContactPage',
            name: fillUi(t.page.jsonLdName, { name: owner }),
            url: absUrl(path),
            inLanguage: lang,
            about: { '@id': PERSON_ID },
          },
          breadcrumb([
            { name: t.page.home, path: homePath },
            { name: t.page.title, path },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader eyebrow={t.page.eyebrow} title={t.page.heading} lede={lede} />
          <AvailabilityCard availability={availability} t={t} zh={zh} />
          <AskEntry mb={8} copy={t.ask} />
          <ContactPro
            home={home || undefined}
            hideBlurb
            vcard={{ href: VCARD_PATH, qrSvg: vcardQr }}
            availability={formAvailability}
            retentionDays={retentionDays}
            t={t}
            lang={lang}
            reasonOptions={reasonOptions ?? undefined}
            cvHref={zh ? '/cv/zh' : '/cv'}
          />
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default Contact

export const getStaticProps: GetStaticProps<ContactPageProps> = async () => {
  const { loadContactPage } = await import('../../lib/contactPage')
  return loadContactPage('en')
}
