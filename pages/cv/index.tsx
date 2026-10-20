import type { GetStaticProps } from 'next'
import CvPageView, { type CvPageProps } from '../../components/CVViewerPage/CvPageView'

/**
 * /cv — the English CV (the Chinese one is /cv/zh; the legacy /cv?lang=zh
 * is redirected there by the proxy). Statically generated (ISR) from the
 * public, CV-audience view of the content store and regenerated on every
 * save that changes it, and every minute (lib/cvPage.ts). ?print=1 is handled
 * client side. The downloadable files are /cv.pdf, /cv.txt and /cv.json.
 */
export default CvPageView

export const getStaticProps: GetStaticProps<CvPageProps> = async () => {
  const { loadCvPageProps } = await import('../../lib/cvPage')
  return loadCvPageProps('en')
}
