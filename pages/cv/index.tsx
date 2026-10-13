import type { GetServerSideProps } from 'next'
import CvPageView, { type CvPageProps } from '../../components/CVViewerPage/CvPageView'
import { SHEET_SECTIONS } from '../../components/CVViewerPage/CVResult'
import { publicNameZh } from '../../components/CVViewerPage/PersonalInformation'
import type { HomeData } from '../../lib/homeShape'
import { referenceMonth } from '../../lib/clock'
import { absUrl, personFactsFromCv } from '../../lib/schema'

/**
 * /cv — the English CV (the Chinese one is /cv/zh; the legacy /cv?lang=zh
 * is redirected there by middleware). Server-rendered on every request so it
 * always shows the current content store. ?print=1 is handled client side.
 */
export default CvPageView

export const getServerSideProps: GetServerSideProps<CvPageProps> = async () => {
  // Live CV from the content store (SQLite kv + R2) — the same source the
  // admin editor writes — reduced to what may appear on the CV, and to the
  // sections the sheet renders. The Chinese CV contributes only the public
  // Chinese name (structured data).
  let sections: any[] = []
  let nameZh = ''
  try {
    const { readPublicCvSections } = await import('../../lib/cvdata')
    const cv = readPublicCvSections('cv', SHEET_SECTIONS)
    sections = cv.en
    nameZh = publicNameZh(cv.zh)
  } catch {
    /* render the empty state rather than failing the page */
  }
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('../../lib/home')
    chromeSocials = readPublicHome()?.socials ?? null
  } catch {
    /* the chrome loads the public home view itself */
  }
  let qrSvg: string | null = null
  try {
    const { qrSvg: makeQr } = await import('../../lib/qr')
    qrSvg = await makeQr(absUrl('/cv'))
  } catch {
    /* the sheet prints without its QR footer */
  }
  return {
    props: {
      sections,
      initialLang: 'en',
      lang: 'en',
      clockMonth: referenceMonth(),
      nameZh,
      personFacts: personFactsFromCv(sections),
      qrSvg,
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
