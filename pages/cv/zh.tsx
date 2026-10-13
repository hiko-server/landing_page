import type { GetStaticProps } from 'next'
import CvPageView, { type CvPageProps } from '../../components/CVViewerPage/CvPageView'

/**
 * /cv/zh — the Chinese CV: its own URL, <html lang="zh-Hans">, Chinese title,
 * description, social card and JSON-LD (the English CV is /cv). Statically
 * generated (ISR) and regenerated on every save that changes it, and every
 * minute (lib/cvPage.ts); ?print=1 is handled client side. The downloadable files
 * are /cv/zh.pdf, /cv/zh.txt and /cv/zh.json.
 */
export default CvPageView

export const getStaticProps: GetStaticProps<CvPageProps> = async () => {
  const { loadCvPageProps } = await import('../../lib/cvPage')
  return loadCvPageProps('zh')
}
