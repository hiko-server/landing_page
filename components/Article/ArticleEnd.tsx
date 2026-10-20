import { useCallback, useEffect, useId, useRef, useState } from 'react'
import NextLink from 'next/link'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { copyText } from '../MDX/clipboard'
import { LinkedInIcon } from '../Icons/brand'
import { CopyIcon, QrCodeIcon, ShareIcon } from '../Icons/ui/content'
import { CheckIcon } from '../Icons/ui/theme'
import { cssTransition } from '../../theme/tokens'
import type { AuthorCardData } from '../../lib/authorCard'
import { langWithin } from '../../lib/toc'
import { fillUi } from '../../lib/uiStrings'
import { useArticleUi } from './articleUi'

/**
 * The end of a post or case study (D7): who wrote it, and how to pass it on.
 *
 *   Written by
 *   (portrait) Li Yanpei (Lucian)                    [View CV] [Contact]
 *              Self-taught full-stack software engineer
 *              ● Available for new work            (only when set)
 *
 *   Share  [Copy link] [Share…] [LinkedIn] [WeChat ▾]
 *
 * Everything comes from public data (lib/authorCard.ts). Sharing involves no
 * third party until the reader acts: "Copy link" uses the clipboard;
 * "Share…" (the system share sheet) appears only where navigator.share
 * exists, after hydration; LinkedIn is a plain link; WeChat opens a QR code
 * of the page drawn on the server (lib/qr.ts) — black on a white tile in
 * both themes so phones can scan it. Results are announced politely. Hidden
 * in print. The labels follow the article's language (lib/uiStrings): 作者 /
 * 查看简历 / 联系我 / 分享 … under a Chinese article; the owner's own words
 * (name, role, availability) keep the language they are written in.
 */

const MONO = 'var(--font-geist-mono), monospace'

export type ShareData = {
  /** Canonical absolute URL of the page. */
  url: string
  title: string
  /** QR code of `url` as inline SVG (server-rendered); null when it could not be made. */
  qrSvg: string | null
}

const chipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  minH: '36px',
  px: 3,
  borderRadius: 'full',
  border: '1px solid',
  borderColor: 'page.border-strong',
  bg: 'transparent',
  color: 'page.fg',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: 1,
  cursor: 'pointer',
  textDecoration: 'none',
  transition: cssTransition(['border-color', 'background-color'], 'fast'),
  _hover: { borderColor: 'page.fg', bg: 'page.hover', textDecoration: 'none' },
  _active: { bg: 'page.bg-overlay' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
  '& svg': { flexShrink: 0 },
} as const

const STATUS_TOKEN = { open: 'status.open', limited: 'status.limited', closed: 'status.closed' } as const

function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] || '')
    .join('')
    .toUpperCase()
}

export function AuthorCard({ author }: { author: AuthorCardData }) {
  const { lang: ui, t } = useArticleUi()
  const zh = ui !== 'en'
  const cardLang = zh ? ui : 'en'
  // The owner's own words (name, role, availability) keep their language: English ones are marked inside a Chinese card.
  const own = (text: string) => langWithin(text, cardLang)
  return (
    <Box as="section" aria-labelledby="author-heading" lang={cardLang}>
      <Text as="h2" id="author-heading" fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" m={0} mb={4}>
        {t.writtenBy}
      </Text>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        align={{ base: 'flex-start', sm: 'center' }}
        gap={{ base: 4, sm: 5 }}
        border="1px solid"
        borderColor="page.border"
        borderRadius="lg"
        bg="page.surface"
        p={{ base: 4, sm: 5 }}
      >
        <Flex align="center" gap={4} flex={1} minW={0}>
          <Box position="relative" w="56px" h="56px" flexShrink={0} borderRadius="full" overflow="hidden" border="1px solid" borderColor="page.border" bg="page.bg-elevated">
            {author.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.avatar.src}
                srcSet={author.avatar.srcSet || undefined}
                sizes={author.avatar.srcSet ? '56px' : undefined}
                alt=""
                width={56}
                height={56}
                loading="lazy"
                decoding="async"
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: author.avatar.position }}
              />
            ) : (
              <Flex aria-hidden w="100%" h="100%" align="center" justify="center" fontFamily={MONO} fontSize="15px" color="page.fg-secondary">
                {initials(author.name)}
              </Flex>
            )}
          </Box>
          <Box minW={0}>
            <Link as={NextLink} href="/about" fontWeight={600} fontSize="16px" color="page.fg" className="link-underline" lang={own(author.name)}>
              {author.name}
            </Link>
            <Text fontSize="14px" color="page.fg-secondary" mt={0.5} noOfLines={2} lang={own(author.role)}>
              {author.role}
            </Text>
            {author.availability ? (
              <Flex as="p" align="center" gap={2} mt={1.5} fontSize="13px" color="page.fg" m={0} pt={1.5} lang={own(author.availability.label)}>
                <Box as="span" aria-hidden w="7px" h="7px" borderRadius="full" bg={STATUS_TOKEN[author.availability.status]} flexShrink={0} sx={{ '@media (forced-colors: active)': { bg: 'CanvasText' } }} />
                {author.availability.label}
              </Flex>
            ) : null}
          </Box>
        </Flex>
        <Flex gap={2} flexShrink={0} wrap="wrap">
          <Box as={NextLink} href={zh ? '/cv/zh' : '/cv'} sx={chipSx}>
            {t.viewCv}
          </Box>
          <Box as={NextLink} href="/contact" sx={{ ...chipSx, bg: 'page.fg', color: 'page.bg', borderColor: 'page.fg', _hover: { bg: 'page.fg', opacity: 0.88, textDecoration: 'none' } }}>
            {t.contact}
          </Box>
        </Flex>
      </Flex>
    </Box>
  )
}

type CopyState = 'idle' | 'copied' | 'failed'

export function ShareBar({ share }: { share: ShareData }) {
  const { lang: ui, t, qrHelpZh } = useArticleUi()
  const panelId = useId()
  const [canShare, setCanShare] = useState(false)
  const [copy, setCopy] = useState<CopyState>('idle')
  const [status, setStatus] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The system share sheet exists only in some browsers: decided after hydration.
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const onCopy = useCallback(async () => {
    const ok = await copyText(share.url)
    setCopy(ok ? 'copied' : 'failed')
    setStatus(ok ? t.linkCopied : t.copyLinkFailed)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopy('idle'), 2000)
  }, [share.url, t])

  const onShare = useCallback(async () => {
    try {
      await navigator.share({ title: share.title, url: share.url })
    } catch {
      /* dismissed (AbortError) or refused: nothing to report */
    }
  }, [share.title, share.url])

  const linkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share.url)}`

  return (
    <Box mt={6} lang={ui}>
      <Flex role="group" aria-labelledby={`${panelId}-label`} align="center" gap={2} wrap="wrap">
        <Text as="span" id={`${panelId}-label`} fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" mr={2}>
          {t.share}
        </Text>
        <Box as="button" type="button" onClick={onCopy} sx={chipSx} aria-describedby={copy === 'failed' ? `${panelId}-status` : undefined}>
          {copy === 'copied' ? <CheckIcon size="sm" /> : <CopyIcon size="sm" />}
          {copy === 'copied' ? t.copied : t.copyLink}
        </Box>
        {canShare ? (
          <Box as="button" type="button" onClick={onShare} sx={chipSx}>
            <ShareIcon size="sm" />
            {t.shareSheet}
          </Box>
        ) : null}
        <Box as="a" href={linkedIn} target="_blank" rel="noopener noreferrer" sx={chipSx}>
          <LinkedInIcon size={14} />
          LinkedIn
          <Box as="span" className="sr-only">
            {t.opensInNewTab}
          </Box>
        </Box>
        {share.qrSvg ? (
          <Box as="button" type="button" onClick={() => setQrOpen((o) => !o)} aria-expanded={qrOpen} aria-controls={`${panelId}-qr`} sx={chipSx}>
            <QrCodeIcon size="sm" />
            {t.wechat}
          </Box>
        ) : null}
        <Box as="span" id={`${panelId}-status`} role="status" aria-live="polite" className={copy === 'failed' ? undefined : 'sr-only'} fontSize="12px" color="status.error">
          {status}
        </Box>
      </Flex>
      {share.qrSvg && qrOpen ? (
        <Flex
          id={`${panelId}-qr`}
          mt={4}
          gap={4}
          align="center"
          direction={{ base: 'column', sm: 'row' }}
          border="1px solid"
          borderColor="page.border"
          borderRadius="lg"
          bg="page.bg-elevated"
          p={4}
          w={{ base: '100%', sm: 'fit-content' }}
        >
          <Box
            role="img"
            aria-label={fillUi(t.qrCodeOf, { url: share.url })}
            bg="#ffffff"
            color="#000000"
            p="10px"
            borderRadius="md"
            w="148px"
            h="148px"
            flexShrink={0}
            sx={{ '& svg': { display: 'block', width: '100%', height: '100%' } }}
            dangerouslySetInnerHTML={{ __html: share.qrSvg }}
          />
          <Box fontSize="13px" lineHeight="1.6" color="page.fg-secondary" maxW="30ch">
            <Text m={0}>{t.qrHelp}</Text>
            {/* WeChat readers are mostly Chinese: an English page adds the Chinese line. */}
            {qrHelpZh ? (
              <Text m={0} mt={1} lang="zh-Hans">
                {qrHelpZh}
              </Text>
            ) : null}
          </Box>
        </Flex>
      ) : null}
    </Box>
  )
}

/** Author card and share row, before the article's prev / next navigation. */
export default function ArticleEnd({ author, share }: { author: AuthorCardData | null; share: ShareData }) {
  return (
    <Box mt={16} pt={10} borderTop="1px solid" borderColor="page.border" className="no-print">
      {author ? <AuthorCard author={author} /> : null}
      <ShareBar share={share} />
    </Box>
  )
}
