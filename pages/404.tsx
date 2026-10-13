import { Box } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
import NotFoundRecovery from '../components/NotFound/NotFoundRecovery'

/**
 * 404 — must stay a real 404 for crawlers (no JS auto-redirect, which Google
 * treats as a soft-404). Laid out like every other page (PageHeader), with
 * a way back (components/NotFound/NotFoundRecovery): Home, a search that
 * opens the palette on the missing address's words, and "Did you mean"
 * pages ranked in the browser. The content area holds at least the
 * viewport, so the footer starts below the fold and the late suggestions
 * never push anything visible.
 */
const Custom404 = () => {
  return (
    <>
      <CustomHead title="404 — Page Not Found" description="The page you’re looking for doesn’t exist or has moved." noindex />
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
          <PageHeader
            eyebrow="Error 404"
            title="This page doesn’t exist."
            lede="The link may be broken, or the page may have moved."
          />
          <NotFoundRecovery />
        </Box>
      </HeaderFooter>
    </>
  )
}

export default Custom404
