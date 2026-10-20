import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/router'
import { Box, Button, HStack } from '@chakra-ui/react'
import { resolveTagParam, TAG_PREPAINT_SCRIPT, TAG_PREPAINT_STYLE_ID, type TagCount } from '../../lib/tagFilter'
import { beginViewTransition, prefersReducedMotion } from '../../lib/viewTransition'
import { fillUi } from '../../lib/uiStrings'

/**
 * URL-synced tag filter for /blog and /work (D8, lib/tagFilter.ts).
 *
 *   - `?tag=<slug>` is the state: shareable, restored on Back / Forward; a
 *     choice updates it with a shallow router.replace (no data fetch, no
 *     page transition, focus stays on the chip).
 *   - The change runs inside a same-document view transition (titles carry
 *     view-transition names, so the remaining items glide into place);
 *     instantly under reduced motion or without the API.
 *   - Chips are toggle buttons (aria-pressed) in a labelled group; the
 *     result is announced politely ("2 posts tagged Edge AI").
 *   - TagPrepaint goes before the list so a shared link is filtered from the
 *     first paint; the hook removes its style once React has the state.
 */

const MONO = 'var(--font-geist-mono), monospace'

export function useTagFilter(tags: readonly TagCount[]) {
  const router = useRouter()
  const fromQuery = useCallback(() => resolveTagParam(router.query.tag, tags)?.slug ?? null, [router.query.tag, tags])
  // Hydration of the static page: no query yet (matches the server HTML). Client navigations: the query is there.
  const [active, setActive] = useState<string | null>(() => (router.isReady ? fromQuery() : null))

  useEffect(() => {
    if (!router.isReady) return
    setActive(fromQuery())
    document.getElementById(TAG_PREPAINT_STYLE_ID)?.remove()
  }, [router.isReady, fromQuery])

  const select = useCallback(
    (slug: string | null) => {
      const apply = () => flushSync(() => setActive(slug))
      if (prefersReducedMotion() || !beginViewTransition(document, apply)) apply()
      const query = { ...router.query }
      if (slug) query.tag = slug
      else delete query.tag
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    },
    [router],
  )

  return { active, select, activeTag: tags.find((t) => t.slug === active) || null }
}

/** Hides non-matching items before the first paint when the URL carries a known `?tag=`. */
export function TagPrepaint({ tags }: { tags: readonly TagCount[] }) {
  if (!tags.length) return null
  return <script data-tags={JSON.stringify(tags.map((t) => t.slug))} dangerouslySetInnerHTML={{ __html: TAG_PREPAINT_SCRIPT }} />
}

const chip = (selected: boolean) => ({
  size: 'xs' as const,
  variant: 'outline' as const,
  bg: selected ? 'page.fg' : 'transparent',
  color: selected ? 'page.bg' : 'page.fg-secondary',
  borderColor: selected ? 'page.fg' : 'page.border-strong',
  fontFamily: MONO,
  fontWeight: 500,
  _hover: { borderColor: 'page.fg', bg: selected ? 'page.fg' : 'transparent' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
})

export default function TagFilterBar({
  tags,
  total,
  active,
  onSelect,
  label,
  noun,
  allLabel = 'all',
  announcement = '{n} {noun} tagged {tag}',
  matching,
}: {
  tags: readonly TagCount[]
  /** Items in the unfiltered list. */
  total: number
  active: string | null
  onSelect: (slug: string | null) => void
  /** Accessible name of the chip group. */
  label: string
  /** Nouns for the announcement ("post" / "posts"). */
  noun: { one: string; many: string }
  /** The chip that clears the filter, in the page's language ("all", "全部"). */
  allLabel?: string
  /** What a screen reader hears after a choice ({n}, {noun}, {tag}; lib/uiStrings/lists). */
  announcement?: string
  /** Items shown under the active tag. */
  matching: number
}) {
  const activeTag = tags.find((t) => t.slug === active)
  return (
    <Box mb={8}>
      <HStack role="group" aria-label={label} spacing={2} flexWrap="wrap" rowGap={2}>
        <Button {...chip(active === null)} aria-pressed={active === null} onClick={() => onSelect(null)}>
          {allLabel} ({total})
        </Button>
        {tags.map((t) => (
          <Button key={t.slug} {...chip(active === t.slug)} aria-pressed={active === t.slug} onClick={() => onSelect(active === t.slug ? null : t.slug)}>
            #{t.tag} ({t.count})
          </Button>
        ))}
      </HStack>
      <Box role="status" aria-live="polite" className="sr-only">
        {activeTag ? fillUi(announcement, { n: matching, noun: matching === 1 ? noun.one : noun.many, tag: activeTag.tag }) : ''}
      </Box>
    </Box>
  )
}
