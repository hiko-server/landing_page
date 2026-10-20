import { Box, Button, ButtonGroup, Flex, HStack, Text } from '@chakra-ui/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import NextLink from 'next/link'

import CVResult from './CVResult'
import ReadingView from './ReadingView'
import ScaledSheet from './ScaledSheet'
import SkillEvidence from './SkillEvidence'
import { PdfIcon } from './CvDownloads'
import { SkillLinksContext } from './evidence'
import { CvHeaderExtrasContext } from './HeaderExtras'
import { FileDownIcon, LockIcon, PrinterIcon } from '../Icons/ui/content'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../General-UI/CustomHead'
import PageHeader from '../General-UI/PageHeader'
import EmptyState from '../General-UI/EmptyState'
import { monthLabel } from '../../lib/cvExport/updated'
import { sharePagePath, sharePdfPath } from '../../lib/cvShare/links'
import { watchShareOpen } from '../../lib/cvShare/openBeacon'
import type { SharedCvProps } from '../../lib/cvShare/page'
import type { CvLang } from '../../lib/cvVisibility'
import { useBottomBarOffset } from '../Common/useBottomBarOffset'

/**
 * A CV variant opened from a private share link (/cv/r/<token>,
 * /cv/r/<token>/zh; E4). The same sheet, Reading view and skill evidence as
 * /cv, built from the variant's selection for the 'private' surface — plus:
 *
 *   - "Shared privately" in the header and a plain note at the end saying
 *     what the link records (an open count and the day of the last open;
 *     no cookies, addresses or devices) and that it is not indexed;
 *   - the variant's own server-rendered PDF (/cv/r/<token>/<lang>.pdf);
 *   - the other language only when the variant has something in it;
 *   - no canonical URL, structured data, social card, QR code or copy-link
 *     action: nothing invites the link to travel further. The page answers
 *     noindex, private / no-store and Referrer-Policy: no-referrer (the
 *     token never leaves in a Referer header).
 *
 * A link that does not work (unknown, expired, revoked, or its variant
 * deleted) shows one neutral "not available" state that points to the
 * public CV.
 */

const mono = 'var(--font-geist-mono), monospace'
const HTML_LANG: Record<CvLang, string> = { en: 'en', zh: 'zh-Hans' }

const COPY = {
  en: {
    eyebrow: 'Shared privately',
    title: 'CV / Résumé',
    updated: 'Updated',
    pdf: 'Download PDF',
    print: 'Print',
    layout: 'layout',
    reading: 'Reading',
    a4: 'A4',
    language: 'language',
    actions: 'CV actions',
    otherName: '中文',
    noteTitle: 'About this link',
    note:
      'This CV was shared with you through a private link. It is not listed on the site or indexed by search engines. Opening it adds one to an open count its owner sees, with the day of the last opening — no cookies, address or device details are kept.',
    goneTitle: 'This link isn’t available',
    gone: 'It may have expired or been withdrawn by its owner. The public CV is always available.',
    goneAction: 'View the public CV',
    goneHome: 'Home',
  },
  zh: {
    eyebrow: '私密分享',
    title: '简历',
    updated: '更新于',
    pdf: '下载 PDF',
    print: '打印',
    layout: '版式',
    reading: '阅读',
    a4: 'A4',
    language: '语言',
    actions: '简历操作',
    otherName: 'English',
    noteTitle: '关于此链接',
    note: '这份简历通过私密链接与你分享，不会出现在网站列表中，也不会被搜索引擎收录。打开此页时，所有者只会看到打开次数与最近一次打开的日期——不保存 Cookie、地址或设备信息。',
    goneTitle: '此链接已不可用',
    gone: '它可能已过期，或已被所有者撤回。公开简历始终可以访问。',
    goneAction: '查看公开简历',
    goneHome: '首页',
  },
} as const

type View = 'reading' | 'a4'

function Unavailable({ lang }: { lang: CvLang }) {
  const T = COPY[lang]
  return (
    <>
      <CustomHead title={T.goneTitle} lang={HTML_LANG[lang]} noindex />
      <Head>
        <meta key="referrer" name="referrer" content="no-referrer" />
      </Head>
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} pt={[8, 12]} pb={16}>
          <PageHeader eyebrow={T.eyebrow} title={T.goneTitle} />
          <EmptyState
            as="p"
            title={T.gone}
            icon={<LockIcon size="md" />}
            actions={[
              { label: T.goneAction, href: lang === 'zh' ? '/cv/zh' : '/cv' },
              { label: T.goneHome, href: '/' },
            ]}
          />
        </Box>
      </HeaderFooter>
    </>
  )
}

export default function SharedCvView(props: SharedCvProps) {
  if (props.state !== 'ok') return <Unavailable lang={props.cvLang} />
  return <SharedCv {...props} />
}

function SharedCv({
  cvLang: language,
  token,
  sections,
  otherLang,
  fileBase,
  updatedMonth,
  ownerNames,
  headerExtras,
  skillEvidence,
  skillLinks,
}: Extract<SharedCvProps, { state: 'ok' }>) {
  const T = COPY[language]
  const [view, setView] = useState<View>('reading')
  const actionBar = useRef<HTMLDivElement>(null)
  useBottomBarOffset(actionBar)

  // One open per real view of this link in this tab (lib/cvShare/openBeacon).
  useEffect(() => watchShareOpen(token), [token])

  const print = useCallback(() => window.print(), [])
  const updated = monthLabel(updatedMonth, language)
  const pdfHref = fileBase ? sharePdfPath(token, language) : ''
  const pdfName = fileBase ? `${fileBase}.pdf` : undefined
  const otherHref = otherLang ? sharePagePath(token, otherLang) : ''
  const skillLinkCtx = useMemo(() => ({ ids: skillLinks || {}, lang: language }), [skillLinks, language])

  const outlineBtn = {
    size: 'sm',
    variant: 'outline',
    borderColor: 'page.border-strong',
    color: 'page.fg-secondary',
    fontFamily: mono,
    fontSize: '11px',
    letterSpacing: '0.04em',
    _hover: { borderColor: 'var(--accent)', color: 'accent.text', textDecoration: 'none' },
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
      <CustomHead title={T.title} lang={HTML_LANG[language]} noindex />
      <Head>
        {/* The token is in the address: never send it on in a Referer (the header says so too). */}
        <meta key="referrer" name="referrer" content="no-referrer" />
      </Head>

      <CvHeaderExtrasContext.Provider value={headerExtras}>
        <HeaderFooter>
          <Box className="cv-print-flow" maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} pt={[8, 12]} pb={[0, 0, 10]}>
            <Box className="no-print">
              <PageHeader
                eyebrow={
                  <HStack as="span" spacing={1.5} display="inline-flex" verticalAlign="middle">
                    <LockIcon size="xs" />
                    <span>{T.eyebrow}</span>
                  </HStack>
                }
                title={T.title}
                lede={
                  updated ? (
                    <>
                      {T.updated} <time dateTime={updatedMonth}>{updated}</time>
                    </>
                  ) : undefined
                }
                actions={
                  <Flex flex="1 1 100%" justify="space-between" align="center" flexWrap="wrap" gap={3} borderBottom="1px solid" borderColor="page.border" pb={4}>
                    <HStack spacing={3} display={{ base: 'flex', md: 'none' }}>
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
                    {otherLang ? (
                      <HStack as="nav" aria-label={T.language} spacing={3} display={{ base: 'none', md: 'flex' }}>
                        <Text fontFamily={mono} fontSize="11px" letterSpacing="0.04em" color="page.fg-secondary" aria-hidden>
                          {T.language}
                        </Text>
                        <ButtonGroup size="sm" isAttached variant="outline">
                          {(['en', 'zh'] as CvLang[]).map((l) =>
                            l === language ? (
                              <Button key={l} as="span" aria-current="page" lang={HTML_LANG[l]} {...segmented(true)}>
                                {l === 'en' ? 'English' : '中文'}
                              </Button>
                            ) : (
                              <Button key={l} as={NextLink} href={otherHref} scroll={false} prefetch={false} hrefLang={HTML_LANG[l]} lang={HTML_LANG[l]} {...segmented(false)}>
                                {l === 'en' ? 'English' : '中文'}
                              </Button>
                            ),
                          )}
                        </ButtonGroup>
                      </HStack>
                    ) : (
                      <Box display={{ base: 'none', md: 'block' }} />
                    )}
                    <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>
                      <Button {...outlineBtn} leftIcon={<PrinterIcon size="sm" />} onClick={print}>
                        {T.print}
                      </Button>
                      {pdfHref ? (
                        <Button
                          as="a"
                          href={pdfHref}
                          download={pdfName}
                          size="sm"
                          h="32px"
                          px={3}
                          bg="accent.solid"
                          color="accent.fg"
                          fontSize="12px"
                          fontWeight={600}
                          leftIcon={<PdfIcon />}
                          _hover={{ bg: 'accent.solid-hover', textDecoration: 'none' }}
                          _active={{ bg: 'accent.solid-active' }}
                        >
                          {T.pdf}
                        </Button>
                      ) : null}
                    </HStack>
                  </Flex>
                }
              />
            </Box>

            <SkillLinksContext.Provider value={skillLinkCtx}>
              <Box className="no-print" display={{ base: view === 'reading' ? 'block' : 'none', md: 'none' }} pb={6}>
                <ReadingView sections={sections} lang={language} ownerNames={ownerNames} />
              </Box>
              <Box className="cv-print-flow" display={{ base: view === 'a4' ? 'block' : 'none', md: 'block' }} pb={{ base: 6, md: 0 }}>
                <ScaledSheet>
                  <CVResult cvData={sections as never} lang={language} ownerNames={ownerNames} qr={null} />
                </ScaledSheet>
              </Box>
              <SkillEvidence evidence={skillEvidence || []} lang={language} />
            </SkillLinksContext.Provider>

            <Box
              as="aside"
              className="no-print"
              aria-labelledby="share-note-title"
              mt={{ base: 8, md: 12 }}
              mb={{ base: 6, md: 0 }}
              maxW="62ch"
              borderTop="1px solid"
              borderColor="page.border"
              pt={5}
            >
              <HStack spacing={2} color="page.fg-subtle" mb={2}>
                <LockIcon size="xs" />
                <Text id="share-note-title" textStyle="label" m={0}>
                  {T.noteTitle}
                </Text>
              </HStack>
              <Text fontSize="14px" lineHeight="1.6" color="page.fg-secondary" sx={{ textWrap: 'pretty' }}>
                {T.note}
              </Text>
            </Box>

            {/* Phones: sticky action bar (data-bottom-bar keeps toasts and focus clear of it). */}
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
              sx={{ '@supports (backdrop-filter: blur(1px))': { bg: 'page.surface', backdropFilter: 'saturate(180%) blur(12px)' } }}
            >
              {pdfHref ? (
                <Button
                  as="a"
                  href={pdfHref}
                  download={pdfName}
                  flex="1"
                  minW={0}
                  h="44px"
                  px={3}
                  bg="accent.solid"
                  color="accent.fg"
                  fontSize="13px"
                  fontWeight={600}
                  _hover={{ bg: 'accent.solid-hover', textDecoration: 'none' }}
                  _active={{ bg: 'accent.solid-active' }}
                >
                  <Box as="span" display={{ base: 'none', sm: 'inline-flex' }} mr={2} aria-hidden>
                    <FileDownIcon size="sm" />
                  </Box>
                  {T.pdf}
                </Button>
              ) : (
                <Box flex="1" minW={0} />
              )}
              {otherLang ? (
                <Button
                  as={NextLink}
                  href={otherHref}
                  scroll={false}
                  prefetch={false}
                  hrefLang={HTML_LANG[otherLang]}
                  lang={HTML_LANG[otherLang]}
                  flexShrink={0}
                  h="44px"
                  px={3}
                  variant="outline"
                  borderColor="page.border-strong"
                  color="page.fg"
                  fontSize="13px"
                  _hover={{ textDecoration: 'none', borderColor: 'var(--accent)' }}
                >
                  {T.otherName}
                </Button>
              ) : null}
              <Button
                flexShrink={0}
                minW="44px"
                h="44px"
                px={{ base: 0, sm: 3 }}
                variant="outline"
                borderColor="page.border-strong"
                color="page.fg"
                fontSize="13px"
                onClick={print}
                aria-label={T.print}
              >
                <PrinterIcon size="sm" />
                <Box as="span" display={{ base: 'none', sm: 'inline' }} ml={2} aria-hidden>
                  {T.print}
                </Box>
              </Button>
            </Flex>
          </Box>
        </HeaderFooter>
      </CvHeaderExtrasContext.Provider>
    </React.Fragment>
  )
}
