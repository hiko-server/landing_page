import { Box, Button, ButtonGroup, Flex, HStack, Text, useToast } from '@chakra-ui/react'
import { FaFilePdf, FaLink, FaPrint } from 'react-icons/fa'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'

import CVResult from './CVResult'
import ReadingView from './ReadingView'
import ScaledSheet from './ScaledSheet'
import { cvDescription, publicSeoSections } from './fields'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../General-UI/CustomHead'
import PageHeader from '../General-UI/PageHeader'
import { copyText } from '../MDX/clipboard'
import {
  absUrl,
  breadcrumb,
  CV_ALTERNATES,
  ogImageUrl,
  personAuthor,
  personNode,
  personRef,
  PERSON_NAME,
  SITE_HOST,
  type PersonFacts,
} from '../../lib/schema'
import type { CvLang } from '../../lib/cvVisibility'
import type { HomeData } from '../../lib/homeShape'
import { useBottomBarOffset } from '../Common/useBottomBarOffset'

/**
 * The bilingual CV page: /cv (English) and /cv/zh (Chinese) render this with
 * their own language. Both routes are server-rendered from the CV-scoped
 * public view (hidden sections / entries / fields removed on the server).
 *
 *   ?print=1   opens the print / Save-as-PDF dialog once rendered (client side)
 *
 * The language switch is a link to the other route (scroll kept, ?print
 * kept), so each language has its own URL, title, description, social card
 * and JSON-LD; hreflang alternates tie the two together.
 *
 * Desktop (md+): the A4 sheet is the hero, fitted to the viewport with CSS
 * zoom. Phones: a reflowed Reading view by default (toggle to the scaled A4
 * sheet), with a sticky bottom bar for PDF / language / link. Printing always
 * prints the A4 sheet at true size, with a print-only QR code back to the
 * live CV: the sheet wrapper is a .cv-print-flow element (forced visible in
 * print) and the Reading view and all chrome are .no-print.
 *
 * Anchors: `#cv-<section>` / `#cv-<section>-<index>` (search results, the
 * command palette). The A4 sheet holds the ids; when it is the hidden view
 * the page scrolls to the Reading view's matching `data-cv-anchor` instead.
 */

type View = 'reading' | 'a4'

export type CvPageProps = {
  /** Public 'cv'-audience sections of this page's language, limited to what the sheet renders. */
  sections: any[]
  initialLang: CvLang
  /** BCP-47 language of the page ('en' / 'zh-Hans'); drives <html lang> in _app. */
  lang: string
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
  /** Chinese name from the public CV ('' when hidden or not set). */
  nameZh: string
  /** The site-wide Person facts (lib/personFacts loadPersonFacts) — identical on every page. */
  personFacts: PersonFacts
  /** Print-only QR code (inline SVG) linking to this page; null when it could not be generated. */
  qrSvg: string | null
}

const mono = 'var(--font-geist-mono), monospace'
const PATHS: Record<CvLang, string> = { en: '/cv', zh: '/cv/zh' }
const HTML_LANG: Record<CvLang, string> = { en: 'en', zh: 'zh-Hans' }

const COPY = {
  en: {
    eyebrow: 'Curriculum vitae',
    title: 'CV / Résumé',
    home: 'Home',
    language: 'language',
    layout: 'layout',
    reading: 'Reading',
    a4: 'A4',
    print: 'Print / Save as PDF',
    pdf: 'Download PDF',
    copy: 'Copy link',
    copied: 'Link copied',
    copyFailed: 'Could not copy — the link is',
    empty: 'The CV has not been published yet.',
    actions: 'CV actions',
    qrCaption: `Live CV · ${SITE_HOST}${PATHS.en}`,
    qrLabel: `QR code linking to ${SITE_HOST}${PATHS.en}`,
  },
  zh: {
    eyebrow: '个人简历',
    title: '简历',
    home: '首页',
    language: '语言',
    layout: '版式',
    reading: '阅读',
    a4: 'A4',
    print: '打印 / 保存 PDF',
    pdf: '下载 PDF',
    copy: '复制链接',
    copied: '链接已复制',
    copyFailed: '无法复制，链接为',
    empty: '中文简历暂未发布。',
    actions: '简历操作',
    qrCaption: `在线简历 · ${SITE_HOST}${PATHS.zh}`,
    qrLabel: `指向 ${SITE_HOST}${PATHS.zh} 的二维码`,
  },
} as const

/** Scroll to the visible element for a `#cv-…` hash: the sheet's id, or the Reading view's data-cv-anchor. */
function revealCvAnchor() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  if (!id.startsWith('cv-')) return
  const candidates = [
    document.getElementById(id),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-cv-anchor]')).filter(
      (el) => el.dataset.cvAnchor === id
    ),
  ]
  const target = candidates.find((el): el is HTMLElement => !!el && el.getClientRects().length > 0)
  target?.scrollIntoView({ block: 'start' })
}

export default function CvPageView({
  sections,
  initialLang,
  nameZh,
  personFacts,
  qrSvg,
}: CvPageProps) {
  const router = useRouter()
  const toast = useToast()
  const language = initialLang
  const T = COPY[language]
  const other: CvLang = language === 'zh' ? 'en' : 'zh'
  const [view, setView] = useState<View>('reading')
  const actionBar = useRef<HTMLDivElement>(null)
  useBottomBarOffset(actionBar)

  // The other language keeps ?print=1, so "print the Chinese version" works from a shared link.
  const printing = router.query.print === '1'
  const otherHref = { pathname: PATHS[other], query: printing ? { print: '1' } : {} }

  // ?print=1 → print once fonts are ready (so CJK glyphs don't print as fallbacks).
  useEffect(() => {
    if (!router.isReady || !printing) return
    let cancelled = false
    const run = async () => {
      try {
        await document.fonts?.ready
      } catch {
        /* fonts API unavailable: print anyway */
      }
      if (!cancelled) window.setTimeout(() => window.print(), 150)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router.isReady, printing])

  // Hash anchors: after the sheet has been fitted (next frame) and on in-page hash changes.
  useEffect(() => {
    const frame = window.requestAnimationFrame(revealCvAnchor)
    window.addEventListener('hashchange', revealCvAnchor)
    router.events.on('hashChangeComplete', revealCvAnchor)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', revealCvAnchor)
      router.events.off('hashChangeComplete', revealCvAnchor)
    }
  }, [router.events])

  const copyLink = useCallback(async () => {
    const url = absUrl(PATHS[language])
    const ok = await copyText(url)
    toast({
      status: ok ? 'success' : 'warning',
      title: ok ? T.copied : `${T.copyFailed} ${url}`,
      position: 'top',
      duration: ok ? 2000 : 6000,
      isClosable: !ok,
    })
  }, [language, toast, T])

  const pageUrl = absUrl(PATHS[language])
  const description = cvDescription(language, { present: publicSeoSections(sections), nameZh })

  const outlineBtn = {
    size: 'sm',
    variant: 'outline',
    borderColor: 'page.border-strong',
    color: 'page.fg-secondary',
    fontFamily: mono,
    fontSize: '11px',
    letterSpacing: '0.04em',
    _hover: { borderColor: 'var(--accent)', color: 'accent.text' },
  } as const

  const segmented = (active: boolean) =>
    ({
      fontFamily: mono,
      fontSize: '12px',
      borderColor: active ? 'var(--accent)' : 'page.border-strong',
      color: active ? 'accent.text' : 'page.fg-secondary',
      bg: active ? 'var(--accent-soft)' : 'transparent',
      zIndex: active ? 1 : undefined,
      _hover: { borderColor: 'var(--accent)', textDecoration: 'none' },
    }) as const

  return (
    <React.Fragment>
      <CustomHead
        title={T.title}
        description={description}
        url={pageUrl}
        alternates={CV_ALTERNATES}
        lang={HTML_LANG[language]}
        nameZh={nameZh || undefined}
        image={ogImageUrl({ kind: 'cv', lang: language, title: T.title })}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: language === 'zh' ? `${nameZh || PERSON_NAME}的简历` : `Résumé of ${PERSON_NAME}`,
            url: pageUrl,
            inLanguage: HTML_LANG[language],
            about: personRef,
            author: personAuthor,
          },
          // The one Person entity, with the same facts as on every other page.
          personNode(personFacts),
          breadcrumb([
            { name: T.home, path: '/' },
            { name: T.title, path: PATHS[language] },
          ]),
        ]}
      />

      <HeaderFooter>
        <Box
          className="cv-print-flow"
          maxW="var(--container-content)"
          mx="auto"
          w="100%"
          px={[4, 6, 8]}
          pt={[8, 12]}
          pb={[0, 0, 10]}
        >
          {/* Page chrome — hidden in print via .no-print */}
          <Box className="no-print">
            <PageHeader
              eyebrow={T.eyebrow}
              title={T.title}
              actions={
                <Flex
                  flex="1 1 100%"
                  justify="space-between"
                  align="center"
                  flexWrap="wrap"
                  gap={3}
                  borderBottom="1px solid"
                  borderColor="page.border"
                  pb={4}
                >
                  {/* Phones: Reading / A4 layout switch */}
                  <HStack
                    spacing={3}
                    display={{ base: sections.length ? 'flex' : 'none', md: 'none' }}
                  >
                    <Text
                      fontFamily={mono}
                      fontSize="11px"
                      letterSpacing="0.04em"
                      color="page.fg-secondary"
                    >
                      {T.layout}
                    </Text>
                    <ButtonGroup
                      size="sm"
                      isAttached
                      variant="outline"
                      role="group"
                      aria-label={T.layout}
                    >
                      {(['reading', 'a4'] as View[]).map((v) => (
                        <Button
                          key={v}
                          onClick={() => setView(v)}
                          aria-pressed={view === v}
                          {...segmented(view === v)}
                        >
                          {v === 'reading' ? T.reading : T.a4}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </HStack>

                  {/* Desktop: language + actions */}
                  <HStack
                    as="nav"
                    aria-label={T.language}
                    spacing={3}
                    display={{ base: 'none', md: 'flex' }}
                  >
                    <Text
                      fontFamily={mono}
                      fontSize="11px"
                      letterSpacing="0.04em"
                      color="page.fg-secondary"
                      aria-hidden
                    >
                      {T.language}
                    </Text>
                    <ButtonGroup size="sm" isAttached variant="outline">
                      {(['en', 'zh'] as CvLang[]).map((l) =>
                        l === language ? (
                          <Button
                            key={l}
                            as="span"
                            aria-current="page"
                            lang={HTML_LANG[l]}
                            {...segmented(true)}
                          >
                            {l === 'en' ? 'English' : '中文'}
                          </Button>
                        ) : (
                          <Button
                            key={l}
                            as={NextLink}
                            href={otherHref}
                            scroll={false}
                            hrefLang={HTML_LANG[l]}
                            lang={HTML_LANG[l]}
                            {...segmented(false)}
                          >
                            {l === 'en' ? 'English' : '中文'}
                          </Button>
                        )
                      )}
                    </ButtonGroup>
                  </HStack>
                  <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>
                    <Button {...outlineBtn} leftIcon={<FaLink aria-hidden />} onClick={copyLink}>
                      {T.copy}
                    </Button>
                    <Button
                      {...outlineBtn}
                      leftIcon={<FaPrint aria-hidden />}
                      onClick={() => window.print()}
                    >
                      {T.print}
                    </Button>
                  </HStack>
                </Flex>
              }
            />
          </Box>

          {sections.length ? (
            <>
              <Box
                className="no-print"
                display={{ base: view === 'reading' ? 'block' : 'none', md: 'none' }}
                pb={6}
              >
                <ReadingView sections={sections} lang={language} />
              </Box>
              <Box
                className="cv-print-flow"
                display={{ base: view === 'a4' ? 'block' : 'none', md: 'block' }}
                pb={{ base: 6, md: 0 }}
              >
                <ScaledSheet>
                  <CVResult
                    cvData={sections}
                    lang={language}
                    qr={qrSvg ? { svg: qrSvg, caption: T.qrCaption, label: T.qrLabel } : null}
                  />
                </ScaledSheet>
              </Box>
            </>
          ) : (
            <Text
              className="no-print"
              color="page.fg-secondary"
              fontSize="15px"
              py={16}
              textAlign="center"
            >
              {T.empty}
            </Text>
          )}

          {/* Phones: sticky action bar. data-bottom-bar: focusing its own
              controls never scrolls the page (globals.css scroll margins). */}
          <Flex
            ref={actionBar}
            className="no-print"
            as="nav"
            data-bottom-bar=""
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
              bg="accent.solid"
              color="accent.fg"
              fontSize="13px"
              fontWeight={600}
              _hover={{ bg: 'accent.solid-hover' }}
              _active={{ bg: 'accent.solid-active' }}
              isDisabled={!sections.length}
            >
              <Box
                as={FaFilePdf}
                aria-hidden
                display={{ base: 'none', sm: 'inline-block' }}
                mr={2}
              />
              {T.pdf}
            </Button>
            {/* Its visible text is its name: "EN / 中文" (no aria-label to contradict it). */}
            <Button
              as={NextLink}
              href={otherHref}
              scroll={false}
              hrefLang={HTML_LANG[other]}
              flexShrink={0}
              h="44px"
              px={3}
              variant="outline"
              borderColor="page.border-strong"
              color="page.fg"
              fontFamily={mono}
              fontSize="13px"
              _hover={{ textDecoration: 'none', borderColor: 'var(--accent)' }}
            >
              <Text as="span" color={language === 'en' ? 'accent.text' : 'page.fg-secondary'}>
                EN
              </Text>
              <Text as="span" px={1.5} color="page.muted">
                /
              </Text>
              <Text
                as="span"
                lang="zh-Hans"
                color={language === 'zh' ? 'accent.text' : 'page.fg-secondary'}
              >
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
              <Box as="span" display={{ base: 'none', sm: 'inline' }} ml={2} aria-hidden>
                {T.copy}
              </Box>
            </Button>
          </Flex>
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}
