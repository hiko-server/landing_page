import type { GetServerSideProps } from 'next'
import SharedCvView from '../../../../components/CVViewerPage/SharedCvView'
import type { SharedCvProps } from '../../../../lib/cvShare/page'

/**
 * /cv/r/<token>/en and /cv/r/<token>/zh — a shared CV variant in a chosen
 * language (any other segment answers 404). lib/cvShare/gssp.ts.
 */
export default SharedCvView

export const getServerSideProps: GetServerSideProps<SharedCvProps> = async (ctx) => {
  const lang = ctx.params?.lang
  if (lang !== 'en' && lang !== 'zh') return { notFound: true }
  const { shareServerSideProps } = await import('../../../../lib/cvShare/gssp')
  return shareServerSideProps(ctx, lang)
}
