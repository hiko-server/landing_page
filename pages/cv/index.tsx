import {
  Box,
  Flex,
  HStack,
  Select,
  Text,
  useColorModeValue,
  useMediaQuery,
} from '@chakra-ui/react'
import React, { useEffect, useState } from 'react'
import Head from 'next/head'

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
  const dim = useColorModeValue('gray.500', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

  return (
    <React.Fragment>
      {/* Preload Noto Sans SC for crisp Chinese print + stable layout */}
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>

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
        <Box maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} py={[6, 10]}>
          {/* Page chrome — hidden in print via .no-print */}
          <Box className="no-print" mb={8}>
            <SectionLabel n={1} mb={4}>
              CV / Resume
            </SectionLabel>
            <Flex
              align="center"
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
              <Text
                fontFamily={monoFont}
                fontSize="11px"
                color={dim}
                ml="auto"
              >
                ↓ download / print button is on the CV sheet itself
              </Text>
            </Flex>
          </Box>

          {/* A4 sheet container — mobile scale preserved */}
          <Box w="full" overflowX="auto" minH={isMobile ? '140vh' : '100vh'}>
            <Box
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
  const fs = await import('fs')
  const path = await import('path')
  const dataPath = path.join(process.cwd(), 'data', 'cvdata.json')
  let en: any[] = []
  let zh: any[] = []
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8') as unknown as string
    const json = JSON.parse(raw)
    en = json.en || []
    zh = json.zh || []
  } catch {}
  return { props: { props: { host }, en, zh } }
}
