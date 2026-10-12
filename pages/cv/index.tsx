import { Box, Button, ButtonGroup, Flex, HStack, Text, useToast } from '@chakra-ui/react'
import { FaFilePdf, FaLink, FaPrint } from 'react-icons/fa'
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import type { GetServerSideProps } from 'next'

import CVResult, { SHEET_SECTIONS } from '../../components/CVViewerPage/CVResult'
import ReadingView from '../../components/CVViewerPage/ReadingView'
import ScaledSheet from '../../components/CVViewerPage/ScaledSheet'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import { absUrl, personNode, personFactsFromCv, breadcrumb, personRef, ogImageUrl, CV_ALTERNATES, PERSON_NAME } from '../../lib/schema'
import type { CvLang } from '../../lib/cvVisibility'

/**
 * /cv — bilingual CV.
 *
 *   ?lang=zh   open the Chinese version (shareable; the toggle keeps the URL in sync)
 *   ?print=1   open the browser's print / Save-as-PDF dialog once rendered
 *
 * Data is the CV-scoped public view (hidden sections / entries / fields are
 * removed on the server), limited to the sections the sheet renders.
 *
 * Desktop (md+): the A4 sheet is the hero, fitted to the viewport with CSS
 * zoom. Phones: a reflowed "Reading" view by default (toggle to the scaled
 * A4 sheet), with a sticky bottom bar for PDF / language / link. Printing
 * always prints the A4 sheet at true size: the sheet wrapper is a
 * .cv-print-flow element (forced visible in print) and the Reading view and
 * all chrome are .no-print (styles/globals.css print rules).
 */

type View = 'reading' | 'a4'
type Props = { en: any[]; zh: any[]; initialLang: CvLang; lang: string }

const mono = 'var(--font-geist-mono), monospace'
const htmlLang = (l: CvLang) => (l === 'zh' ? 'zh-Hans' : 'en')

/** Copy text to the clipboard; falls back to a hidden textarea where the async API is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

const COPY = {
  en: {
    title: 'CV / Resume',
    language: 'language',
    layout: 'layout',
    reading: 'Reading',
    a4: 'A4',
    print: 'Print / Save as PDF',
    pdf: 'Download PDF',
    copy: 'Copy link',
    copied: 'Link copied',
    copyFailed: 'Could not copy — the link is',
    switchTo: 'Switch to Chinese',
    other: '中文',
    empty: 'The CV has not been published yet.',
    actions: 'CV actions',
  },
  zh: {
    title: '简历',
    language: '语言',
    layout: '版式',
    reading: '阅读',
    a4: 'A4',
    print: '打印 / 保存 PDF',
    pdf: '下载 PDF',
    copy: '复制链接',
    copied: '链接已复制',
    copyFailed: '无法复制，链接为',
    switchTo: 'Switch to English',
    other: 'EN',
    empty: '中文简历暂未发布。',
    actions: '简历操作',
  },
} as const

const CVPage = ({ en, zh, initialLang }: Props) => {
  const router = useRouter()
  const toast = useToast()
  const [language, setLanguage] = useState<CvLang>(initialLang)
  const [view, setView] = useState<View>('reading')
  const cvData = language === 'zh' ? zh : en
  const T = COPY[language]

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

  // Keep <html lang> in step with the client-side language toggle (the
  // server sets it from props.lang); other pages default to English.
  useEffect(() => {
    document.documentElement.lang = htmlLang(language)
  }, [language])
  useEffect(
    () => () => {
      document.documentElement.lang = 'en'
    },
    [],
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

  const copyLink = useCallback(async () => {
    const url = absUrl(language === 'zh' ? '/cv?lang=zh' : '/cv')
    const ok = await copyText(url)
    toast({
      status: ok ? 'success' : 'warning',
      title: ok ? T.copied : `${T.copyFailed} ${url}`,
      position: 'top',
      duration: ok ? 2000 : 6000,
      isClosable: !ok,
    })
  }, [language, toast, T])

  const outlineBtn = {
    size: 'sm',
    variant: 'outline',
    borderColor: 'page.border-strong',
    color: 'page.fg-secondary',
    fontFamily: mono,
    fontSize: '11px',
    letterSpacing: '0.04em',
    _hover: { borderColor: 'var(--accent)', color: 'var(--accent)' },
  } as const

  const segmented = (active: boolean) =>
    ({
      fontFamily: mono,
      fontSize: '12px',
      borderColor: active ? 'var(--accent)' : 'page.border-strong',
      color: active ? 'var(--accent)' : 'page.fg-secondary',
      bg: active ? 'var(--accent-soft)' : 'transparent',
      zIndex: active ? 1 : undefined,
      _hover: { borderColor: 'var(--accent)' },
    }) as const

  return (
    <React.Fragment>
      <CustomHead
        title="CV / Resume"
        description="The CV / résumé of Li Yanpei (Lucian) in English and Chinese: education, experience, projects, patents and awards, printable as an A4 PDF."
        url={absUrl(language === 'zh' ? '/cv?lang=zh' : '/cv')}
        alternates={CV_ALTERNATES}
        lang={htmlLang(language)}
        image={ogImageUrl({ kind: 'cv', title: 'CV / Resume', subtitle: 'Skills, timeline & PDF' })}
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
          // Facts already printed on this page (the public 'cv' audience).
          personNode(personFactsFromCv(en)),
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'CV / Resume', path: '/cv' },
          ]),
        ]}
      />

      <HeaderFooter>
        <Box className="cv-print-flow" maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} pt={[6, 10]} pb={[0, 0, 10]}>
          {/* Page chrome — hidden in print via .no-print */}
          <Box className="no-print" mb={[5, 8]}>
            <SectionLabel n={1} mb={4} as="h1">
              {T.title}
            </SectionLabel>
            <Flex
              justify="space-between"
              align="center"
              flexWrap="wrap"
              gap={3}
              borderBottom="1px solid"
              borderColor="page.border"
              pb={4}
            >
              {/* Phones: Reading / A4 layout switch */}
              <HStack spacing={3} display={{ base: cvData.length ? 'flex' : 'none', md: 'none' }}>
                <Text fontFamily={mono} fontSize="11px" letterSpacing="0.04em" color="page.fg-secondary">
                  {T.layout}
                </Text>
                <ButtonGroup size="sm" isAttached variant="outline" role="group" aria-label={T.layout}>
                  {(['reading', 'a4'] as View[]).map((v) => (
                    <Button key={v} onClick={() => setView(v)} aria-pressed={view === v} {...segmented(view === v)}>
                      {v === 'reading' ? T.reading : T.a4}
                    </Button>
                  ))}
                </ButtonGroup>
              </HStack>

              {/* Desktop: language + actions */}
              <HStack spacing={3} display={{ base: 'none', md: 'flex' }}>
                <Text fontFamily={mono} fontSize="11px" letterSpacing="0.04em" color="page.fg-secondary">
                  {T.language}
                </Text>
                <ButtonGroup size="sm" isAttached variant="outline" role="group" aria-label={T.language}>
                  {(['en', 'zh'] as CvLang[]).map((l) => (
                    <Button key={l} onClick={() => switchLang(l)} aria-pressed={language === l} lang={htmlLang(l)} {...segmented(language === l)}>
                      {l === 'en' ? 'English' : '中文'}
                    </Button>
                  ))}
                </ButtonGroup>
              </HStack>
              <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>
                <Button {...outlineBtn} leftIcon={<FaLink aria-hidden />} onClick={copyLink}>
                  {T.copy}
                </Button>
                <Button {...outlineBtn} leftIcon={<FaPrint aria-hidden />} onClick={() => window.print()}>
                  {T.print}
                </Button>
              </HStack>
            </Flex>
          </Box>

          {cvData.length ? (
            <>
              <Box className="no-print" display={{ base: view === 'reading' ? 'block' : 'none', md: 'none' }} pb={6}>
                <ReadingView sections={cvData} lang={language} />
              </Box>
              <Box className="cv-print-flow" display={{ base: view === 'a4' ? 'block' : 'none', md: 'block' }} pb={{ base: 6, md: 0 }}>
                <ScaledSheet>
                  <CVResult cvData={cvData} lang={language} />
                </ScaledSheet>
              </Box>
            </>
          ) : (
            <Text className="no-print" color="page.fg-secondary" fontSize="15px" py={16} textAlign="center">
              {T.empty}
            </Text>
          )}

          {/* Phones: sticky action bar */}
          <Flex
            className="no-print"
            as="nav"
            aria-label={T.actions}
            display={{ base: 'flex', md: 'none' }}
            position="sticky"
            bottom={0}
            zIndex={20}
            mx={[-4, -6]}
            px={[4, 6]}
            pt={2.5}
            pb="calc(10px + env(safe-area-inset-bottom, 0px))"
            gap={2}
            bg="page.bg"
            borderTop="1px solid"
            borderColor="page.border"
            sx={{
              '@supports (backdrop-filter: blur(1px))': {
                bg: 'page.surface',
                backdropFilter: 'saturate(180%) blur(12px)',
              },
            }}
          >
            <Button
              flex="1"
              minW={0}
              h="44px"
              px={3}
              onClick={() => window.print()}
              bg="var(--accent)"
              color="white"
              fontSize="13px"
              fontWeight={600}
              _hover={{ bg: '#4f46e5' }}
              _active={{ bg: '#4338ca' }}
              isDisabled={!cvData.length}
            >
              <Box as={FaFilePdf} aria-hidden display={{ base: 'none', sm: 'inline-block' }} mr={2} />
              {T.pdf}
            </Button>
            <Button
              flexShrink={0}
              h="44px"
              px={3}
              variant="outline"
              borderColor="page.border-strong"
              color="page.fg"
              fontFamily={mono}
              fontSize="13px"
              onClick={() => switchLang(language === 'zh' ? 'en' : 'zh')}
              aria-label={`EN / 中文 — ${T.switchTo}`}
            >
              <Text as="span" aria-hidden color={language === 'en' ? 'var(--accent)' : 'page.fg-secondary'}>
                EN
              </Text>
              <Text as="span" aria-hidden px={1.5} color="page.muted">
                /
              </Text>
              <Text as="span" aria-hidden lang="zh-Hans" color={language === 'zh' ? 'var(--accent)' : 'page.fg-secondary'}>
                中文
              </Text>
            </Button>
            <Button
              flexShrink={0}
              minW="44px"
              h="44px"
              px={{ base: 0, sm: 3 }}
              variant="outline"
              borderColor="page.border-strong"
              color="page.fg"
              fontSize="13px"
              onClick={copyLink}
              aria-label={T.copy}
            >
              <Box as={FaLink} aria-hidden />
              <Box as="span" display={{ base: 'none', sm: 'inline' }} ml={2}>
                {T.copy}
              </Box>
            </Button>
          </Flex>
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default CVPage

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  // Live CV from the content store (SQLite kv + R2) — the same source the admin
  // editor writes — reduced to what may appear on the CV, and to the sections
  // the sheet actually renders.
  let en: any[] = []
  let zh: any[] = []
  try {
    const { readPublicCvSections } = await import('../../lib/cvdata')
    const cv = readPublicCvSections('cv', SHEET_SECTIONS)
    en = cv.en
    zh = cv.zh
  } catch {
    /* best effort — render with what we have */
  }
  const q = context.query.lang
  const initialLang: CvLang = q === 'zh' || q === 'cn' ? 'zh' : 'en'
  return { props: { en, zh, initialLang, lang: htmlLang(initialLang) } }
}
