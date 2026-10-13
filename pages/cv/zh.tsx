import type { GetServerSideProps } from 'next'
import CvPageView, { type CvPageProps } from '../../components/CVViewerPage/CvPageView'
import { SHEET_SECTIONS } from '../../components/CVViewerPage/CVResult'
import { publicNameZh } from '../../components/CVViewerPage/PersonalInformation'
import type { HomeData } from '../../lib/homeShape'
import { referenceMonth } from '../../lib/clock'
import { absUrl } from '../../lib/schema'

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
  try {
    const { readPublicHome } = await import('../../lib/home')
    chromeSocials = readPublicHome()?.socials ?? null
  } catch {
    /* the chrome loads the public home view itself */
  }
  // Publications (lib/publicationsData): the owner's name forms for author
  // lists, and whether /publications exists (the page and the chrome link to it).
  let publications: Pick<CvPageProps, 'ownerNames' | 'chromePublications'> = {}
  try {
    const { chromePublicationsProp, readCvOwnerNames } = await import('../../lib/publicationsData')
    publications = { ownerNames: readCvOwnerNames(), ...chromePublicationsProp() }
  } catch {
    /* author lists render without emphasis; no link to /publications */
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
      ...publications,
    },
  }
}
