import { useSyncExternalStore } from 'react'
import { Box } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
import NotFoundRecovery from '../components/NotFound/NotFoundRecovery'
import { useReportHtmlLang } from '../components/Common/htmlLang'
import { NOT_FOUND_UI } from '../lib/uiStrings/notFound'
import { ZH_LANG, isZhSitePath } from '../lib/zhRoutes'

const noSubscription = () => () => undefined

/**
 * The missing address's language: Chinese under /zh/ (F3), else English.
 * The page is static, so the server HTML (and hydrating it) is English; the
 * address is read from the browser after hydration — at once when the 404
 * follows a client-side navigation.
 */
function useNotFoundLang(): 'en' | typeof ZH_LANG {
  const path = useSyncExternalStore(noSubscription, () => window.location.pathname, () => null)
  return path && isZhSitePath(path) ? ZH_LANG : 'en'
}

/**
 * 404 — must stay a real 404 for crawlers (no JS auto-redirect, which Google
 * treats as a soft-404). Laid out like every other page (PageHeader), with
 * a way back (components/NotFound/NotFoundRecovery): Home, a search that
 * opens the palette on the missing address's words, and "Did you mean"
 * pages ranked in the browser. The content area holds at least the
 * viewport, so the footer starts below the fold and the late suggestions
 * never push anything visible.
 *
 * Under /zh/ the page and the chrome speak Chinese (lib/uiStrings/notFound;
 * the page reports its language to pages/_app, which sets <html lang> and
 * loads the chrome's Chinese words). Home is the English home page: a
 * static page cannot know whether /zh exists.
 */
const Custom404 = () => {
  const lang = useNotFoundLang()
  useReportHtmlLang(lang)
  const t = NOT_FOUND_UI[lang]
  return (
    <>
      <CustomHead title={t.title} description={t.description} lang={lang} noindex />
      <HeaderFooter>
        <Box
          maxW="var(--container-content)"
          mx="auto"
          px={[4, 6, 8]}
          py={[12, 16]}
          sx={{
            minHeight: 'calc(100vh - var(--header-h))',
            '@supports (height: 100svh)': { minHeight: 'calc(100svh - var(--header-h))' },
          }}
        >
          <PageHeader eyebrow={t.eyebrow} title={t.heading} lede={t.lede} />
          <NotFoundRecovery t={t} />
        </Box>
      </HeaderFooter>
    </>
  )
}

export default Custom404
