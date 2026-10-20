import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Box,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { inputProps, MONO, warnTextProps } from '../shell/ui'
import { detectContentLang, readingMinutes } from '../../../lib/toc'
import { PERSON_NAME, SITE_HOST, cardImageAlt, ogLangOf } from '../../../lib/schema'
import {
  LANGUAGE_CHOICES,
  SEO_TITLE_MAX,
  SERP_TITLE_FONT,
  SERP_TITLE_PX,
  descriptionAdvice,
  effectiveDescription,
  fitToWidth,
  languageLabel,
  pageTitleFor,
  serpBreadcrumb,
  serpDate,
} from '../../../lib/serpPreview'

/**
 * Search & sharing panel of the post and case-study editors (H1): the
 * search title, language, "Mark as updated" (posts) and the description
 * guidance, then live previews of what the page will send — a Google
 * result (title measured against Google's ~600 px cut with canvas
 * measureText), and the link cards of LinkedIn, X, WhatsApp and Slack
 * with the REAL social card from /api/og, signed for the unsaved state by
 * /api/admin/og-preview (debounced 800 ms; loaded only while this panel is
 * open). WeChat is shown as it really looks without its JS-SDK: the title
 * and a generic link icon, no image or description.
 *
 * Loaded on demand (next/dynamic) when the owner opens the section.
 */

export type SeoPanelProps = {
  collection: 'blog' | 'work'
  slug: string
  title: string
  seoTitle: string
  onSeoTitle: (v: string) => void
  description: string
  body: string
  lang: string
  onLang: (v: string) => void
  tags: string[]
  cover: string
  coverAlt: string
  /** The cover's focal point "x% y%" (the card is cropped around it). */
  coverFocus?: string
  /** Posts: publication date (YYYY-MM-DD) and "Mark as updated". */
  date?: string
  updated?: string
  onUpdated?: (v: string) => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

/** Google's result-title blue in each theme (the preview mimics the real result). */
const SERP_LINK = { light: '#1a0dab', dark: '#99c3ff' } as const
/** WhatsApp's outgoing-bubble tint, translucent so it reads in both themes. */
const WHATSAPP_BUBBLE = 'rgba(37, 211, 102, 0.12)'

/** Canvas text measurement in the font of a Google result title. */
function useTitleMeasure(): (text: string) => number {
  const ctx = useRef<CanvasRenderingContext2D | null>(null)
  return useMemo(
    () => (text: string) => {
      if (!ctx.current) {
        const c = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
        if (c) c.font = SERP_TITLE_FONT
        ctx.current = c
      }
      // Without a canvas (very old browsers): ~10 px per character, Google's own rule of thumb.
      return ctx.current ? ctx.current.measureText(text).width : Array.from(text).length * 10
    },
    [],
  )
}

type CardState = { status: 'loading' } | { status: 'ready'; src: string } | { status: 'error'; reason: string }

/** The signed card for the current state, refreshed 800 ms after the last change. */
function useCardPreview(input: { collection: 'blog' | 'work'; title: string; lang: 'en' | 'zh'; date?: string; mins: number; tags: string[]; cover: string; coverFocus?: string }): CardState {
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const key = JSON.stringify(input)
  useEffect(() => {
    if (!input.title.trim()) {
      setState({ status: 'error', reason: 'Add a title to see the card.' })
      return
    }
    const ctrl = new AbortController()
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }))
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/og-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: key,
          signal: ctrl.signal,
        })
        const data = (await res.json().catch(() => ({}))) as { card?: string; error?: string }
        if (ctrl.signal.aborted) return
        if (!res.ok || typeof data.card !== 'string') {
          setState({ status: 'error', reason: res.status === 429 ? 'Paused — too many previews in a short time.' : data.error || `HTTP ${res.status}` })
          return
        }
        setState({ status: 'ready', src: data.card })
      } catch {
        if (!ctrl.signal.aborted) setState({ status: 'error', reason: 'Network error — preview not refreshed.' })
      }
    }, 800)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
    // `key` serialises every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

function CardImage({ state, alt, radius = '0' }: { state: CardState; alt: string; radius?: string }) {
  return (
    <Box position="relative" sx={{ aspectRatio: '1200 / 630' }} bg="page.bg-overlay" borderRadius={radius} overflow="hidden">
      {state.status === 'ready' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.src} alt={alt} width={1200} height={630} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : state.status === 'loading' ? (
        <Skeleton position="absolute" inset={0} />
      ) : (
        <Flex position="absolute" inset={0} align="center" justify="center" px={4} textAlign="center">
          <Text fontSize="xs" color="page.fg-secondary">
            {state.reason}
          </Text>
        </Flex>
      )}
    </Box>
  )
}

function PreviewFrame({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <Box as="figure" m={0} minW={0}>
      <Box border="1px solid" borderColor="page.border" borderRadius="lg" bg="page.bg" p={3}>
        {children}
      </Box>
      <Text as="figcaption" mt={1.5} fontFamily={MONO} fontSize="11px" color="page.fg-secondary">
        {label}
        {note ? (
          <Text as="span" fontFamily="body" display="block" mt={0.5}>
            {note}
          </Text>
        ) : null}
      </Text>
    </Box>
  )
}

/** Generic "link" glyph WeChat shows for pages without a JS-SDK share card. */
function LinkGlyph() {
  return (
    <Flex w="48px" h="48px" flexShrink={0} align="center" justify="center" bg="page.bg-overlay" borderRadius="sm" color="page.fg-secondary" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </Flex>
  )
}

export default function SeoPanel(p: SeoPanelProps) {
  const ids = useId()
  const measure = useTitleMeasure()
  const path = `/${p.collection}/${p.slug || (p.collection === 'blog' ? 'my-post' : 'my-project')}`
  const detected = useMemo(() => detectContentLang({ title: p.title, body: p.body }), [p.title, p.body])
  const effectiveLang = p.lang || detected
  const pageTitle = pageTitleFor({ title: p.title, seoTitle: p.seoTitle, lang: effectiveLang })
  const serpTitle = useMemo(() => fitToWidth(pageTitle, SERP_TITLE_PX, measure), [pageTitle, measure])
  // The page's own fallback when there is no description (pages/blog/[slug], pages/work/[slug]).
  const fallbackDescription = p.title ? `${p.title} — ${p.collection === 'blog' ? 'an essay' : 'a project case study'} by ${PERSON_NAME}.` : ''
  const description = useMemo(() => effectiveDescription(p.description, p.body, fallbackDescription), [p.description, p.body, fallbackDescription])
  const advice = descriptionAdvice(p.description)
  const mins = useMemo(() => readingMinutes(p.body), [p.body])
  const card = useCardPreview({
    collection: p.collection,
    title: p.title,
    lang: ogLangOf(effectiveLang),
    date: p.collection === 'blog' ? p.date : undefined,
    mins,
    tags: p.tags.slice(0, 3),
    cover: p.cover,
    coverFocus: p.coverFocus || undefined,
  })
  const alt = cardImageAlt(p.title || 'Untitled', p.cover, p.coverAlt)
  const seoLen = Array.from(p.seoTitle.trim()).length
  // What composeTitle appends (" · <name>", or the Chinese name on a Chinese page).
  const shownBase = (p.seoTitle.trim() || p.title).replace(/\s+/g, ' ').trim()
  const suffix = shownBase && pageTitle.startsWith(shownBase) ? pageTitle.slice(shownBase.length).trim() : ''
  const date = p.collection === 'blog' ? serpDate(p.updated || p.date) : ''
  const url = `https://${SITE_HOST}${path}`

  return (
    <Stack spacing={6}>
      <Stack spacing={4}>
        <FormControl>
          <FormLabel fontSize="13px" htmlFor={`${ids}-seo-title`}>
            Search title
          </FormLabel>
          <Input
            {...inputProps}
            id={`${ids}-seo-title`}
            value={p.seoTitle}
            onChange={(e) => p.onSeoTitle(e.target.value)}
            placeholder={p.title || 'Same as the title'}
            maxLength={SEO_TITLE_MAX}
            aria-describedby={`${ids}-seo-title-help`}
          />
          <FormHelperText id={`${ids}-seo-title-help`} fontSize="xs" {...(seoLen > SEO_TITLE_MAX || serpTitle.truncated ? warnTextProps : { color: 'page.fg-secondary' })}>
            <span className="tnum">
              {seoLen}/{SEO_TITLE_MAX}
            </span>{' '}
            · Leave empty to use the title.{suffix ? ` The page adds “${suffix}”.` : ''}{' '}
            {serpTitle.truncated
              ? `Google cuts this one (${Math.round(serpTitle.width)} px of about ${SERP_TITLE_PX}).`
              : `Fits Google’s ${SERP_TITLE_PX} px (${Math.round(serpTitle.width)} px).`}
          </FormHelperText>
        </FormControl>

        <Box>
          <Text fontSize="13px" fontWeight={500} mb={1}>
            Description
          </Text>
          <Text fontSize="xs" {...(advice.level === 'warning' ? warnTextProps : { color: 'page.fg-secondary' })}>
            {advice.text}
          </Text>
        </Box>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl>
            <FormLabel fontSize="13px" htmlFor={`${ids}-lang`}>
              Language
            </FormLabel>
            <Select {...inputProps} id={`${ids}-lang`} value={p.lang} onChange={(e) => p.onLang(e.target.value)} aria-describedby={`${ids}-lang-help`}>
              <option value="">Detect from the text ({languageLabel(detected)})</option>
              {LANGUAGE_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              {p.lang && !LANGUAGE_CHOICES.some((c) => c.value === p.lang) ? <option value={p.lang}>{p.lang}</option> : null}
            </Select>
            <FormHelperText id={`${ids}-lang-help`} fontSize="xs" color="page.fg-secondary">
              Sets the page’s lang attribute, og:locale and the card’s labels.
            </FormHelperText>
          </FormControl>

          {p.collection === 'blog' && p.onUpdated ? (
            <FormControl>
              <Flex align="center" justify="space-between" gap={3} mb={2}>
                <FormLabel fontSize="13px" htmlFor={`${ids}-updated-switch`} m={0}>
                  Mark as updated
                </FormLabel>
                <Switch
                  id={`${ids}-updated-switch`}
                  colorScheme="accent"
                  isChecked={!!p.updated}
                  onChange={(e) => p.onUpdated?.(e.target.checked ? todayISO() : '')}
                  aria-describedby={`${ids}-updated-help`}
                />
              </Flex>
              {p.updated ? (
                <Input
                  {...inputProps}
                  type="date"
                  size="sm"
                  value={p.updated}
                  min={p.date || undefined}
                  onChange={(e) => p.onUpdated?.(e.target.value)}
                  aria-label="Updated on"
                />
              ) : null}
              <FormHelperText id={`${ids}-updated-help`} fontSize="xs" color="page.fg-secondary">
                Shows “Updated” on the post and tells search engines and feeds it changed (dateModified). Leave off for small fixes.
              </FormHelperText>
            </FormControl>
          ) : (
            <Box>
              <Text fontSize="13px" fontWeight={500} mb={1}>
                Last updated
              </Text>
              <Text fontSize="xs" color="page.fg-secondary">
                Case studies tell search engines when they were last published (dateModified follows each publish).
              </Text>
            </Box>
          )}
        </SimpleGrid>

        <Box>
          <Text fontSize="13px" fontWeight={500} mb={1}>
            Card alt text
          </Text>
          <Text fontSize="xs" color="page.fg-secondary">
            “{alt}”
            {p.cover && !p.coverAlt.trim() ? ' — describe the cover in the cover field to add what it shows.' : ''}
          </Text>
        </Box>
      </Stack>

      <Box>
        <Text fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" mb={3}>
          Previews
        </Text>
        <Stack spacing={5}>
          <PreviewFrame label="Google · desktop result" note="Search engines may rewrite titles and snippets.">
            <Box maxW="600px" fontFamily="Arial, Helvetica, sans-serif">
              <Flex align="center" gap={2.5} mb={1}>
                <Flex w="26px" h="26px" borderRadius="full" bg="page.bg-overlay" align="center" justify="center" flexShrink={0} aria-hidden>
                  {/* The site's own favicon, as Google shows it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon.svg" alt="" width={16} height={16} style={{ display: 'block', borderRadius: 3 }} />
                </Flex>
                <Box minW={0} lineHeight={1.3}>
                  <Text fontSize="14px" color="page.fg" noOfLines={1}>
                    {SITE_HOST}
                  </Text>
                  <Text fontSize="12px" color="page.fg-secondary" noOfLines={1}>
                    {serpBreadcrumb(path)}
                  </Text>
                </Box>
              </Flex>
              <Text fontSize="20px" lineHeight={1.3} color={SERP_LINK.light} _dark={{ color: SERP_LINK.dark }} whiteSpace="nowrap" overflow="hidden" data-testid="serp-title">
                {serpTitle.text}
              </Text>
              <Text fontSize="14px" lineHeight={1.58} color="page.fg-secondary" noOfLines={2} mt={0.5} data-testid="serp-description">
                {date ? (
                  <Text as="span" color="page.fg-subtle">
                    {date} —{' '}
                  </Text>
                ) : null}
                {description}
              </Text>
            </Box>
          </PreviewFrame>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
            <PreviewFrame label="LinkedIn · post">
              <Box border="1px solid" borderColor="page.border" borderRadius="md" overflow="hidden">
                <CardImage state={card} alt={alt} />
                <Box px={3} py={2.5}>
                  <Text fontSize="14px" fontWeight={600} noOfLines={2} lineHeight={1.35}>
                    {pageTitle}
                  </Text>
                  <Text fontSize="12px" color="page.fg-secondary" mt={1}>
                    {SITE_HOST}
                  </Text>
                </Box>
              </Box>
            </PreviewFrame>

            <PreviewFrame label="X · large image card">
              <Box position="relative">
                <CardImage state={card} alt={alt} radius="16px" />
                <Box position="absolute" left={2.5} bottom={2.5} px={1.5} py={0.5} borderRadius="sm" bg="blackAlpha.700" color="white" fontSize="12px" maxW="80%" noOfLines={1}>
                  {pageTitle}
                </Box>
              </Box>
              <Text fontSize="12px" color="page.fg-secondary" mt={1.5}>
                From {SITE_HOST}
              </Text>
            </PreviewFrame>

            <PreviewFrame label="WhatsApp · chat">
              <Box maxW="340px" ml="auto" borderRadius="lg" bg={WHATSAPP_BUBBLE} p={1.5}>
                <Box borderRadius="md" overflow="hidden" bg="page.bg-elevated">
                  <CardImage state={card} alt={alt} />
                  <Box px={2.5} py={2}>
                    <Text fontSize="13px" fontWeight={600} noOfLines={2} lineHeight={1.35}>
                      {pageTitle}
                    </Text>
                    <Text fontSize="12px" color="page.fg-secondary" noOfLines={2} mt={0.5}>
                      {description}
                    </Text>
                    <Text fontSize="11px" color="page.fg-subtle" mt={1}>
                      {SITE_HOST}
                    </Text>
                  </Box>
                </Box>
                <Text fontSize="12px" color="accent.text" px={1.5} pt={1.5} noOfLines={1}>
                  {url}
                </Text>
              </Box>
            </PreviewFrame>

            <PreviewFrame label="Slack · unfurl">
              <Flex gap={2.5}>
                <Box w="3px" borderRadius="full" bg="page.border-strong" flexShrink={0} aria-hidden />
                <Box minW={0} flex={1}>
                  <Text fontSize="12px" fontWeight={700}>
                    {SITE_HOST}
                  </Text>
                  <Text fontSize="14px" fontWeight={700} color="accent.text" noOfLines={2} lineHeight={1.35}>
                    {pageTitle}
                  </Text>
                  <Text fontSize="13px" color="page.fg-secondary" noOfLines={3} mt={0.5}>
                    {description}
                  </Text>
                  <Box mt={2} maxW="360px">
                    <CardImage state={card} alt={alt} radius="6px" />
                  </Box>
                </Box>
              </Flex>
            </PreviewFrame>
          </SimpleGrid>

          <PreviewFrame
            label="WeChat · chat"
            note="WeChat shows only the page title and a generic link icon — no image or description — unless a page uses its JS-SDK, which needs a verified Official Account, an ICP-filed domain and a third-party script this site does not load. For WeChat, share the QR code from the article’s share row."
          >
            <Flex maxW="320px" ml="auto" gap={2.5} align="center" p={2.5} borderRadius="md" bg="page.bg-elevated" border="1px solid" borderColor="page.border">
              <Box minW={0} flex={1}>
                <Text fontSize="13px" fontWeight={500} noOfLines={2} lineHeight={1.35}>
                  {pageTitle}
                </Text>
                <Text fontSize="11px" color="page.fg-secondary" noOfLines={1} mt={1}>
                  {url}
                </Text>
              </Box>
              <LinkGlyph />
            </Flex>
          </PreviewFrame>
        </Stack>
        {card.status === 'error' ? null : (
          <Text fontSize="11px" color="page.fg-secondary" mt={3}>
            The image is the real card the page will use. Each app crops and styles its card a little differently.
          </Text>
        )}
      </Box>
    </Stack>
  )
}
