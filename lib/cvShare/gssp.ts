import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import type { CvLang } from '../cvVisibility'
import type { SharedCvProps } from './page'

/**
 * getServerSideProps of /cv/r/[token] (the link's own language) and
 * /cv/r/[token]/[lang] (en | zh) — SERVER-ONLY. Every answer is private,
 * never stored, never indexed and sends no Referer; a link that does not
 * work answers 404 with the neutral "not available" page.
 */
export async function shareServerSideProps(
  ctx: GetServerSidePropsContext,
  requested: CvLang | null,
): Promise<GetServerSidePropsResult<SharedCvProps>> {
  const { SHARE_RESPONSE_HEADERS, loadSharePage, unavailableProps } = await import('./page')
  for (const [name, value] of SHARE_RESPONSE_HEADERS) ctx.res.setHeader(name, value)
  const token = ctx.params?.token
  let props: SharedCvProps
  try {
    props = await loadSharePage(typeof token === 'string' ? token : null, requested)
  } catch {
    props = unavailableProps(requested ?? 'en')
  }
  if (props.state !== 'ok') ctx.res.statusCode = 404
  else {
    try {
      const { chromePublicationsProp } = await import('../publicationsData')
      props = { ...props, ...chromePublicationsProp() }
    } catch {
      /* no /publications link in the chrome */
    }
  }
  return { props }
}
