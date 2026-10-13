import React, { createContext, useContext } from 'react'
import { Box, Link, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import type { CvLink } from '../../lib/cvLinks'
import type { CvLang } from '../../lib/cvVisibility'

/**
 * Evidence on the CV page itself:
 *
 *   SkillName    a skill as the CV writes it; when the page has an evidence
 *                row for it (lib/skillEvidence → SkillEvidence below the
 *                CV), it links to that row (#skill-…). Used inline (a role's
 *                skills line on the sheet) and in the Reading view. Without
 *                a provider — the admin Studio preview — it is plain text.
 *   SheetLinks   the case-study / live / code links under a project on the
 *                A4 sheet (lib/cvLinks projectLinks): printed as text with
 *                the URL, so the paper CV carries the evidence too.
 */

export type SkillLinks = { ids: Readonly<Record<string, string>>; lang: CvLang }

export const SkillLinksContext = createContext<SkillLinks | null>(null)

/** The evidence-row id for a skill name on this page, or ''. */
export function useSkillLinkId(name: string): string {
  const ctx = useContext(SkillLinksContext)
  return (ctx && Object.prototype.hasOwnProperty.call(ctx.ids, name) && ctx.ids[name]) || ''
}

/** Accessible name of a skill link: the visible name first (WCAG 2.5.3), then where it leads. */
export function skillLinkLabel(name: string, lang: CvLang): string {
  return lang === 'zh' ? `${name}：查看技能出处` : `${name}: where it is used`
}

/** Screen: a quiet dotted underline; print: plain text in the sheet's colour. */
export const skillLinkSx = {
  color: 'inherit',
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: 'rgba(17, 17, 17, 0.4)',
  textUnderlineOffset: '2px',
  borderRadius: '2px',
  _hover: { textDecorationStyle: 'solid', textDecorationColor: 'currentColor' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
  '@media print': { textDecoration: 'none' },
} as const

/** The same on the themed Reading view (light and dark). */
const pageSkillLinkSx = {
  ...skillLinkSx,
  textDecorationColor: 'page.fg-subtle',
  _hover: { textDecorationStyle: 'solid', textDecorationColor: 'var(--accent)' },
} as const

export function SkillName({ name, variant = 'sheet' }: { name: string; variant?: 'sheet' | 'page' }) {
  const ctx = useContext(SkillLinksContext)
  const id = useSkillLinkId(name)
  if (!id || !ctx) return <>{name}</>
  return (
    <Box as="a" href={`#${id}`} sx={variant === 'page' ? pageSkillLinkSx : skillLinkSx} aria-label={skillLinkLabel(name, ctx.lang)}>
      {name}
    </Box>
  )
}

/** Case study (same-site), live site and repository links of a project on the A4 sheet. */
export function SheetLinks({ links, sep }: { links: CvLink[]; sep: string }) {
  if (!links.length) return null
  return (
    <Text fontSize="12px" lineHeight="1.5" mt="3px">
      {links.map((l, i) => (
        <React.Fragment key={l.kind}>
          {i ? (
            <Text as="span" px="6px" aria-hidden>
              ·
            </Text>
          ) : null}
          <Text as="span" fontWeight={600}>
            {l.label}
            {sep}
          </Text>
          {l.path ? (
            <Link as={NextLink} href={l.path} color="var(--cv-separator-color, blue)" wordBreak="break-all">
              {l.text}
            </Link>
          ) : (
            <Link href={l.href} isExternal color="var(--cv-separator-color, blue)" wordBreak="break-all">
              {l.text}
            </Link>
          )}
        </React.Fragment>
      ))}
    </Text>
  )
}
