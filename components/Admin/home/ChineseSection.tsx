import { useEffect, useId, useState, type ReactNode } from 'react'
import { Box, Flex, FormControl, FormErrorMessage, FormLabel, Input, Link, SimpleGrid, Text, Textarea } from '@chakra-ui/react'
import NextLink from 'next/link'
import { HOME_LIMITS, ZH_TEXT_MAX } from '../../../lib/homeShape'
import { DEFAULT_REASONS } from '../../../lib/inquiry'
import { CONTACT_UI } from '../../../lib/uiStrings/contact'
import type { ZhPageStatus } from '../../../lib/zhRoutes'
import { MONO, inputProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { ImagePreview, type Updater } from './ImageCards'
import type { ContactForm, HeroForm, HighlightItem, PhotoItem } from './homeForm'

/**
 * The home page's Chinese copy (F3). A Chinese page is published only while
 * its copy is written — nothing is ever translated for the owner:
 *
 *   /zh          the Chinese tagline (plus, optionally, the "currently
 *                coding" lines, the highlights and the photo captions)
 *   /zh/contact  the Chinese contact heading or blurb (plus the eyebrow and
 *                the reasons' Chinese names)
 *   /zh/about    the Chinese bio (About editor → 中文)
 *   /zh/work, /zh/blog  a published case study / post in Chinese
 *
 * The status at the top is the saved state (GET /api/admin/zh-pages), read
 * again after every save. Inputs carry lang="zh-Hans"; the English text each
 * one stands for is shown beside it.
 */

const ZH = 'zh-Hans'

/** What publishes each Chinese page. */
const WHAT_PUBLISHES: Record<string, string> = {
  '/zh': 'the Chinese tagline below',
  '/zh/about': 'the Chinese bio',
  '/zh/work': 'a published case study in Chinese (a translation counts)',
  '/zh/blog': 'a published post in Chinese (a translation counts)',
  '/zh/contact': 'the Chinese contact heading or blurb below',
}

const tooLong = (v: string | undefined, max: number) => ((v || '').trim().length > max ? `Keep it under ${max} characters.` : undefined)

/** A Chinese text field with the English text it stands for. */
function ZhField({
  label,
  value,
  onChange,
  english,
  help,
  multiline = false,
  max = ZH_TEXT_MAX,
  invalid,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  english?: string
  help?: string
  multiline?: boolean
  max?: number
  invalid?: string
}) {
  const error = invalid ?? tooLong(value, max)
  const field = { ...inputProps, size: 'sm' as const, lang: ZH, value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) }
  return (
    <FormControl isInvalid={!!error}>
      <FormLabel mb={1} fontSize="xs" color="page.fg-secondary">
        {label}
      </FormLabel>
      {multiline ? <Textarea {...field} rows={3} /> : <Input {...field} />}
      {error ? <FormErrorMessage fontSize="xs">{error}</FormErrorMessage> : null}
      {english?.trim() ? (
        <Text mt={1} fontSize="xs" color="page.fg-secondary" noOfLines={2}>
          English:{' '}
          <Text as="span" fontFamily={MONO}>
            {english.trim()}
          </Text>
        </Text>
      ) : null}
      {help && !error ? (
        <Text mt={1} fontSize="xs" color="page.fg-secondary">
          {help}
        </Text>
      ) : null}
    </FormControl>
  )
}

function GroupTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <Text as="h4" id={id} fontSize="sm" fontWeight={600} color="page.fg" mt={6} mb={2}>
      {children}
    </Text>
  )
}

/** The saved state of every Chinese page. */
function PageStatus({ savedAt }: { savedAt?: number }) {
  const [pages, setPages] = useState<ZhPageStatus[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/admin/zh-pages', { cache: 'no-store' })
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(String(data.error || res.status))
        const list = Array.isArray(data.pages) ? (data.pages as ZhPageStatus[]).filter((p) => p && typeof p.path === 'string') : []
        if (alive) {
          setPages(list)
          setFailed(false)
        }
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [savedAt])

  if (failed) {
    return (
      <Text fontSize="xs" color="page.fg-secondary" role="status">
        Couldn’t read which Chinese pages are published — they still follow the rules above.
      </Text>
    )
  }
  if (!pages) return <Box h="120px" aria-hidden="true" />
  return (
    <Box as="ul" listStyleType="none" m={0} p={0} border="1px solid" borderColor="page.border" borderRadius="lg" data-testid="zh-page-status">
      {pages.map((p, i) => (
        <Flex
          as="li"
          key={p.path}
          align="baseline"
          gap={3}
          px={3}
          py={2}
          borderTop={i ? '1px solid' : undefined}
          borderColor="page.border"
          flexWrap="wrap"
          fontSize="sm"
        >
          <Link href={p.path} target="_blank" rel="noopener" fontFamily={MONO} minW="104px" color="page.fg">
            {p.path}
            <Text as="span" srOnly>
              {' '}
              (opens in a new tab)
            </Text>
          </Link>
          <Text as="span" fontWeight={500} color={p.live ? 'status.open' : 'page.fg-secondary'} minW="112px">
            {p.live ? '● Published' : '○ Not published'}
          </Text>
          <Text as="span" fontSize="xs" color="page.fg-secondary" flex="1 1 220px">
            {p.live ? 'Shown while there is ' : 'Published once there is '}
            {WHAT_PUBLISHES[p.path] || 'its Chinese copy'}
            {p.path === '/zh/about' ? (
              <>
                {' '}
                (
                <Link as={NextLink} href="/admin/about?lang=zh" textDecoration="underline">
                  About → 中文
                </Link>
                )
              </>
            ) : null}
            .
          </Text>
        </Flex>
      ))}
    </Box>
  )
}

export default function ChineseSection({
  hero,
  contact,
  highlights,
  photos,
  set,
  savedAt,
}: {
  hero: HeroForm
  contact: ContactForm
  highlights: HighlightItem[]
  photos: PhotoItem[]
  set: { hero: Updater<HeroForm>; contact: Updater<ContactForm>; highlights: Updater<HighlightItem[]>; photos: Updater<PhotoItem[]> }
  /** Bumped by each save: the status is read again. */
  savedAt?: number
}) {
  const reasonsId = useId()
  const builtInNames = CONTACT_UI[ZH].reasons as Readonly<Record<string, string>>
  const reasons = Array.from(new Set(contact.reasons.map((r) => r.trim()).filter(Boolean)))
  const coding = hero.currentlyCoding
  const setCoding = (key: 'label_zh' | 'project_zh' | 'note_zh', v: string) =>
    set.hero((h) => ({ ...h, currentlyCoding: { ...h.currentlyCoding, [key]: v } }))
  const setHighlight = (id: string, change: Partial<HighlightItem>) =>
    set.highlights((prev) => prev.map((h) => (h._id === id ? { ...h, ...change } : h)))
  const setPhoto = (id: string, describe_zh: string) => set.photos((prev) => prev.map((p) => (p._id === id ? { ...p, describe_zh } : p)))
  // Own keys only: a reason named "constructor" has no inherited name.
  const reasonName = (reason: string) => {
    const names = contact.reasons_zh || {}
    return Object.hasOwn(names, reason) ? names[reason] : ''
  }
  const setReason = (reason: string, name: string) =>
    set.contact((c) => {
      const next = { ...(c.reasons_zh || {}) }
      if (name) next[reason] = name
      else delete next[reason]
      return { ...c, reasons_zh: next }
    })

  return (
    <Box>
      <PageStatus savedAt={savedAt} />

      <GroupTitle>Home page (/zh)</GroupTitle>
      <SimpleGrid columns={[1, 2]} gap={4}>
        <Box gridColumn="1 / -1">
          <ZhField
            label="Tagline (中文)"
            value={hero.tagline_zh}
            onChange={(v) => set.hero((h) => ({ ...h, tagline_zh: v }))}
            english={hero.tagline}
            help="Same “role | phrase | phrase” form as the English tagline. /zh is published while this is set."
            multiline
          />
        </Box>
      </SimpleGrid>
      <Text mt={4} mb={2} fontSize="xs" color="page.fg-secondary">
        Currently coding chip (中文) — blank lines come from the Chinese CV, like the English chip from the English one.
      </Text>
      <SimpleGrid columns={[1, 3]} gap={3}>
        <ZhField label="Top label" value={coding.label_zh} onChange={(v) => setCoding('label_zh', v)} english={coding.label} />
        <ZhField label="Project line" value={coding.project_zh} onChange={(v) => setCoding('project_zh', v)} english={coding.project} />
        <ZhField label="Footer note" value={coding.note_zh} onChange={(v) => setCoding('note_zh', v)} english={coding.note} />
      </SimpleGrid>

      {highlights.length ? (
        <>
          <GroupTitle>Highlights (中文)</GroupTitle>
          <Text mb={3} fontSize="xs" color="page.fg-secondary">
            Both lines, or neither: a highlight without them shows its English words on /zh, marked as English.
          </Text>
          <Box as="ol" m={0} p={0} listStyleType="none">
            {highlights.map((h, i) => {
              const v = h.value_zh || ''
              const l = h.label_zh || ''
              const half = !!v.trim() !== !!l.trim()
              return (
                <SimpleGrid as="li" key={h._id} columns={[1, 2]} gap={3} mb={4} aria-label={`Highlight ${i + 1}`}>
                  <ZhField
                    label={`Highlight ${i + 1} — headline`}
                    value={v}
                    onChange={(x) => setHighlight(h._id, { value_zh: x })}
                    english={h.value}
                    max={HOME_LIMITS.highlightValueMax}
                    invalid={half && !v.trim() ? 'Write both lines, or neither.' : undefined}
                  />
                  <ZhField
                    label={`Highlight ${i + 1} — description`}
                    value={l}
                    onChange={(x) => setHighlight(h._id, { label_zh: x })}
                    english={h.label}
                    max={HOME_LIMITS.highlightLabelMax}
                    invalid={half && !l.trim() ? 'Write both lines, or neither.' : undefined}
                  />
                </SimpleGrid>
              )
            })}
          </Box>
        </>
      ) : null}

      {photos.length ? (
        <>
          <GroupTitle>Photo captions (中文)</GroupTitle>
          <Text mb={3} fontSize="xs" color="page.fg-secondary">
            The caption and alt text on /zh. Blank = the English one, marked as English.
          </Text>
          <SimpleGrid as="ol" columns={{ base: 1, md: 2 }} gap={4} m={0} p={0} listStyleType="none">
            {photos.map((p, i) => (
              <Flex as="li" key={p._id} gap={3} align="flex-start">
                <Box w="72px" flexShrink={0}>
                  <ImagePreview src={p.url} alt="" variant="photo" />
                </Box>
                <Box flex={1} minW={0}>
                  <ZhField label={`Photo ${i + 1}`} value={p.describe_zh || ''} onChange={(v) => setPhoto(p._id, v)} english={p.describe} />
                </Box>
              </Flex>
            ))}
          </SimpleGrid>
        </>
      ) : null}

      <GroupTitle>Contact page (/zh/contact)</GroupTitle>
      <SimpleGrid columns={[1, 2]} gap={4}>
        <ZhField label="Eyebrow (中文)" value={contact.eyebrow_zh} onChange={(v) => set.contact((c) => ({ ...c, eyebrow_zh: v }))} english={contact.eyebrow} />
        <ZhField label="Heading (中文)" value={contact.heading_zh} onChange={(v) => set.contact((c) => ({ ...c, heading_zh: v }))} english={contact.heading} />
        <Box gridColumn="1 / -1">
          <ZhField
            label="Blurb (中文)"
            value={contact.blurb_zh}
            onChange={(v) => set.contact((c) => ({ ...c, blurb_zh: v }))}
            english={contact.blurb}
            help="/zh/contact is published while the heading or the blurb is set. The availability’s Chinese label and roles are under Availability."
            multiline
          />
        </Box>
      </SimpleGrid>
      {reasons.length ? (
        <Box mt={4} role="group" aria-labelledby={reasonsId}>
          <Text id={reasonsId} fontSize="xs" color="page.fg-secondary" mb={2}>
            Reasons (中文) — blank = the English reason, marked as English (a built-in reason keeps its built-in Chinese name).
          </Text>
          <SimpleGrid columns={[1, 2]} gap={3}>
            {reasons.map((r) => {
              const builtIn = (DEFAULT_REASONS as readonly string[]).includes(r) && Object.hasOwn(builtInNames, r) ? builtInNames[r] : ''
              return (
                <FormControl key={r} isInvalid={!!tooLong(reasonName(r), ZH_TEXT_MAX)}>
                  <FormLabel mb={1} fontSize="xs" color="page.fg-secondary" fontFamily={MONO} noOfLines={1}>
                    {r}
                  </FormLabel>
                  <Input
                    {...inputProps}
                    size="sm"
                    lang={ZH}
                    value={reasonName(r)}
                    placeholder={builtIn}
                    onChange={(e) => setReason(r, e.target.value)}
                  />
                  <FormErrorMessage fontSize="xs">{tooLong(reasonName(r), ZH_TEXT_MAX)}</FormErrorMessage>
                </FormControl>
              )
            })}
          </SimpleGrid>
        </Box>
      ) : (
        <Text mt={4} fontSize="xs" color="page.fg-secondary">
          The built-in reasons have Chinese names of their own on /zh/contact.
        </Text>
      )}
    </Box>
  )
}
