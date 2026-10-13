import type { GetServerSideProps } from 'next'
import CvPageView, { type CvPageProps } from '../../components/CVViewerPage/CvPageView'
import { SHEET_SECTIONS } from '../../components/CVViewerPage/CVResult'
import { publicNameZh } from '../../components/CVViewerPage/PersonalInformation'
import type { HomeData } from '../../lib/homeShape'
import { referenceMonth } from '../../lib/clock'
import { absUrl, personFactsFromCv } from '../../lib/schema'

/**
 * /cv/zh — the Chinese CV: its own URL, <html lang="zh-Hans">, Chinese title,
 * description, social card and JSON-LD (the English CV is /cv). Server-
 * rendered on every request; ?print=1 is handled client side.
 */
export default CvPageView

export const getServerSideProps: GetServerSideProps<CvPageProps> = async () => {
  // Same public 'cv' view as /cv. The English CV supplies the person facts
  // for structured data, which are kept in one (English) form site-wide.
  let sections: any[] = []
  let personFacts: CvPageProps['personFacts'] = {}
  try {
    const { readPublicCvSections } = await import('../../lib/cvdata')
    const cv = readPublicCvSections('cv', SHEET_SECTIONS)
    sections = cv.zh
    personFacts = personFactsFromCv(cv.en)
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
    qrSvg = await makeQr(absUrl('/cv/zh'))
  } catch {
    /* the sheet prints without its QR footer */
  }
  return {
    props: {
      sections,
      initialLang: 'zh',
      lang: 'zh-Hans',
      clockMonth: referenceMonth(),
      nameZh: publicNameZh(sections),
      personFacts,
      qrSvg,
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
