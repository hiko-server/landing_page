import type { GetServerSideProps } from 'next'
import CvPageView, { type CvPageProps } from '../../components/CVViewerPage/CvPageView'
import { SHEET_SECTIONS } from '../../components/CVViewerPage/CVResult'
import { publicNameZh } from '../../components/CVViewerPage/PersonalInformation'
import type { HomeData } from '../../lib/homeShape'
import { referenceMonth } from '../../lib/clock'
import { absUrl } from '../../lib/schema'
import { cvHeaderExtras, type CvHeaderExtras } from '../../lib/cvLocale'

/**
 * /cv/zh — the Chinese CV: its own URL, <html lang="zh-Hans">, Chinese title,
 * description, social card and JSON-LD (the English CV is /cv). Server-
 * rendered on every request; ?print=1 is handled client side.
 */
export default CvPageView

export const getServerSideProps: GetServerSideProps<CvPageProps> = async () => {
  // Same public 'cv' view as /cv.
  let sections: any[] = []
  try {
    const { readPublicCvSections } = await import('../../lib/cvdata')
    sections = readPublicCvSections('cv', SHEET_SECTIONS, ['zh']).zh
  } catch {
    /* render the empty state rather than failing the page */
  }
  // The site-wide Person entity: the same (English) facts every page emits.
  let personFacts: CvPageProps['personFacts'] = {}
  try {
    personFacts = (await import('../../lib/personFacts')).loadPersonFacts()
  } catch {
    /* the node keeps its built-in defaults */
  }
  let chromeSocials: HomeData['socials'] | null | undefined
  let headerExtras: CvHeaderExtras | null = null
  try {
    const { readPublicHome } = await import('../../lib/home')
    const home = readPublicHome()
    chromeSocials = home?.socials ?? null
    // 求职意向 and the right-to-work line from the owner's availability, when set.
    headerExtras = cvHeaderExtras(home?.availability, 'zh')
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
      headerExtras,
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
