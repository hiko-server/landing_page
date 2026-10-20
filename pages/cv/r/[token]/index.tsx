import type { GetServerSideProps } from 'next'
import SharedCvView from '../../../../components/CVViewerPage/SharedCvView'
import type { SharedCvProps } from '../../../../lib/cvShare/page'

/**
 * /cv/r/<token> — a CV variant opened from a private share link, in the
 * language the owner chose for the link (/cv/r/<token>/en and …/zh name it).
 * Rendered per request: lib/cvShare/gssp.ts.
 */
export default SharedCvView

export const getServerSideProps: GetServerSideProps<SharedCvProps> = async (ctx) => {
  const { shareServerSideProps } = await import('../../../../lib/cvShare/gssp')
  return shareServerSideProps(ctx, null)
}
