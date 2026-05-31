import {
  Box,
  Button,
  Flex,
  HStack,
  Select,
  Text,
  useColorModeValue,
  useMediaQuery,
} from '@chakra-ui/react'
import { FaPrint } from 'react-icons/fa'
import React, { useEffect, useState } from 'react'

import CVResult from '../../components/CVViewerPage/CVResult'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'

/**
 * /cv — bilingual CV viewer page.
 *
 * Functionality preserved verbatim:
 *   - EN/ZH switch (data sourced from data/cvdata.json)
 *   - A4-print layout with mobile scale transform (kept)
 *   - Noto Sans SC preconnect+preload for clean Chinese print
 *   - JSON-LD CreativeWork tag
 *
 * Visual upgrades:
 *   - v6 chrome around the A4 sheet (mono language selector + Print button)
 *   - SectionLabel introducing the page (hidden when printing)
 *   - All inner CV typography untouched (CVResult still owns its print CSS)
 */

const CVPage = ({
  props,
  en,
  zh,
}: {
  props: any
  en: any[]
  zh: any[]
}) => {
  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 768px)', { ssr: true, fallback: false })

  useEffect(() => {
    if (props?.host && props?.host === 'cv.hiko.dev') setIsHostCV(true)
  }, [props?.host])

  const [language, setLanguage] = useState<'en' | 'zh'>('en')
  const cvData = language === 'zh' ? zh : en

  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const dim = useColorModeValue('gray.600', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

  return (
    <React.Fragment>
      <CustomHead
        title="CV / Resume"
        description="Hiko's CV with skills matrix, timeline, and downloadable PDF."
        url={`https://${props?.host || 'hiko.dev'}/cv`}
        image="/images/hikoAvator.png"
        type="article"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: 'Resume of Li Yanpei (Hiko)',
            url: `https://${props?.host || 'hiko.dev'}/cv`,
            author: { '@type': 'Person', name: 'Li Yanpei (Hiko)' },
          },
        ]}
      />

      <HeaderFooter isMobile={isMobile}>
        <Box className="cv-print-flow" maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} py={[6, 10]}>
          {/* Page chrome — hidden in print via .no-print */}
          <Box className="no-print" mb={8}>
            <SectionLabel n={1} mb={4}>
              CV / Resume
            </SectionLabel>
            <Flex
              justify="space-between"
              align="center"
              flexWrap="wrap"
              gap={3}
              borderBottom="1px solid"
              borderColor={border}
              pb={4}
            >
              <HStack spacing={3}>
                <Text
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.04em"
                  color={dim}
                >
                  language
                </Text>
                <Select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'zh')}
                  size="sm"
                  w="120px"
                  borderColor={border}
                  fontFamily={monoFont}
                  fontSize="12px"
                  _hover={{ borderColor: dim }}
                  _focus={{ borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }}
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </Select>
              </HStack>

              <Button
                size="sm"
                variant="outline"
                leftIcon={<FaPrint />}
                onClick={() => window.print()}
                borderColor={border}
                color={dim}
                fontFamily={monoFont}
                fontSize="11px"
                letterSpacing="0.04em"
                _hover={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Print / Save as PDF
              </Button>
            </Flex>
          </Box>

          {/* A4 sheet container — mobile scale preserved */}
          <Box className="cv-print-flow" w="full" overflowX="auto" minH={isMobile ? '140vh' : '100vh'}>
            <Box
              className="cv-print-flow"
              w={isMobile ? '125%' : '100%'}
              transform={isMobile ? 'scale(0.8)' : 'none'}
              transformOrigin="top left"
              sx={{
                transition: 'transform 0.3s ease',
                '@media print': {
                  transform: 'none !important',
                  width: '100% !important',
                  position: 'static !important',
                },
              }}
            >
              <CVResult
                cvData={cvData}
                style={{ fontSize: isMobile ? '10px' : '12px', minWidth: isMobile ? '800px' : 'auto' }}
              />
            </Box>
          </Box>
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default CVPage

export const getServerSideProps = async (context: any) => {
  const host = context.req.headers.host || 'hiko.dev'
  // Read the LIVE CV from the content store (SQLite kv + R2) — the same source
  // the admin editor writes via /api/cvdata. This previously read the static
  // data/cvdata.json seed file, so admin edits never appeared on /cv.
  let en: any[] = []
  let zh: any[] = []
  try {
    const { readCvData } = await import('../../lib/cvdata')
    const cv = readCvData()
    en = cv.en
    zh = cv.zh
  } catch {}
  return { props: { props: { host }, en, zh } }
}
