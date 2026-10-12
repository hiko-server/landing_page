import { Box, Button, ButtonGroup, Flex, HStack, Text, useColorModeValue } from '@chakra-ui/react'
import { FaPrint } from 'react-icons/fa'
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import type { GetServerSideProps } from 'next'

import CVResult from '../../components/CVViewerPage/CVResult'
import ScaledSheet from '../../components/CVViewerPage/ScaledSheet'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import { absUrl, personNode, breadcrumb, personRef, PERSON_NAME } from '../../lib/schema'
import type { CvLang } from '../../lib/cvVisibility'

/**
 * /cv — bilingual A4 CV viewer.
 *
 *   ?lang=zh   open the Chinese version (shareable; the toggle keeps the URL in sync)
 *   ?print=1   open the browser's print / Save-as-PDF dialog once rendered
 *
 * Data is the CV-scoped public view (hidden sections / entries / fields are
 * removed on the server). The sheet is fitted to the viewport with CSS zoom
 * and printed at true A4 size (styles/globals.css print rules).
 */

type Props = { en: any[]; zh: any[]; initialLang: CvLang }

const CVPage = ({ en, zh, initialLang }: Props) => {
  const router = useRouter()
  const [language, setLanguage] = useState<CvLang>(initialLang)
  const cvData = language === 'zh' ? zh : en

  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const monoFont = 'var(--font-geist-mono), monospace'

  const switchLang = useCallback(
    (l: CvLang) => {
      setLanguage(l)
      const query = { ...router.query }
      if (l === 'zh') query.lang = 'zh'
      else delete query.lang
      delete query.print
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    },
    [router],
  )

  // ?print=1 → print once fonts are ready (so CJK glyphs don't print as fallbacks).
  useEffect(() => {
    if (!router.isReady || router.query.print !== '1') return
    let cancelled = false
    const run = async () => {
      try {
        await (document as any).fonts?.ready
      } catch {
        /* ignore */
      }
      if (!cancelled) window.setTimeout(() => window.print(), 150)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router.isReady, router.query.print])

  const title = language === 'zh' ? '简历' : 'CV / Resume'

  return (
    <React.Fragment>
      <CustomHead
        title="CV / Resume"
        description="The CV / résumé of Li Yanpei (Lucian): bilingual EN/ZH, education (HKMU, UOW College), experience, projects, patents and awards — printable as an A4 PDF."
        url={absUrl('/cv')}
        image={absUrl('/api/og?title=CV%20%2F%20Resume&kind=page&subtitle=Skills%2C%20timeline%20%26%20PDF')}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: `Résumé of ${PERSON_NAME}`,
            url: absUrl('/cv'),
            inLanguage: ['en', 'zh'],
            about: personRef,
            author: personRef,
          },
          personNode(),
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'CV / Resume', path: '/cv' },
          ]),
        ]}
      />

      <HeaderFooter>
        <Box className="cv-print-flow" maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} py={[6, 10]}>
          {/* Page chrome — hidden in print via .no-print */}
          <Box className="no-print" mb={[5, 8]}>
            <SectionLabel n={1} mb={4} as="h1">
              {title}
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
                <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.04em" color={dim}>
                  language
                </Text>
                <ButtonGroup size="sm" isAttached variant="outline" role="group" aria-label="CV language">
                  {(['en', 'zh'] as CvLang[]).map((l) => (
                    <Button
                      key={l}
                      onClick={() => switchLang(l)}
                      aria-pressed={language === l}
                      fontFamily={monoFont}
                      fontSize="12px"
                      borderColor={language === l ? 'var(--accent)' : border}
                      color={language === l ? 'var(--accent)' : dim}
                      bg={language === l ? 'var(--accent-soft)' : 'transparent'}
                      zIndex={language === l ? 1 : undefined}
                      _hover={{ borderColor: 'var(--accent)' }}
                    >
                      {l === 'en' ? 'English' : '中文'}
                    </Button>
                  ))}
                </ButtonGroup>
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
                {language === 'zh' ? '打印 / 保存 PDF' : 'Print / Save as PDF'}
              </Button>
            </Flex>
          </Box>

          {cvData.length ? (
            <ScaledSheet>
              <CVResult cvData={cvData} lang={language} />
            </ScaledSheet>
          ) : (
            <Text className="no-print" color={dim} fontSize="14px" py={16} textAlign="center">
              {language === 'zh' ? '中文简历暂未发布。' : 'The CV has not been published yet.'}
            </Text>
          )}
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default CVPage

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  // Live CV from the content store (SQLite kv + R2) — the same source the admin
  // editor writes via /api/cvdata — reduced to what may appear on the CV.
  let en: any[] = []
  let zh: any[] = []
  try {
    const { readPublicCvData } = await import('../../lib/cvdata')
    const cv = readPublicCvData('cv')
    en = cv.en
    zh = cv.zh
  } catch {
    /* best effort — render with what we have */
  }
  const q = context.query.lang
  const initialLang: CvLang = q === 'zh' || q === 'cn' ? 'zh' : 'en'
  return { props: { en, zh, initialLang } }
}
