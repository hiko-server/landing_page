import React, { createContext, useContext, useId, useState } from 'react'
import { Box, Flex, Heading, Text } from '@chakra-ui/react'
import Collapse from '../General-UI/Collapse'
import { clearOfHeader } from '../../lib/anchorOffset'

/**
 * Set by the page that stacks the sections (LandingCVSections):
 *   - `expanded`: every section starts open (/about shows the record in full)
 *   - `headingLevel`: each section's toggle sits inside a heading of this
 *     level (the WAI-ARIA accordion pattern), so the sections appear in the
 *     page outline and screen-reader heading navigation
 *   - `anchorId`: id of this section (a jump target for a section nav)
 */
export const CVSectionsContext = createContext<{ expanded?: boolean; headingLevel?: 'h2' | 'h3'; anchorId?: string }>({})

/**
 * Shared shell for every CV accordion section on /about.
 *
 * The concrete section files (Education, Project, WorkExperience,
 * CompetitionAwards, Skill, Certificate, Patents, ExtraSkill) only own
 * what's inside the expanded panel — the chrome (label, count chip,
 * animated chevron, hairline divider, accent strip on hover/expand)
 * lives here.
 *
 * Design (rauno + engineer + premium):
 *   - Single hairline 1px border, no rounded mega-radius and no boxShadow
 *   - The section's title alone on the left (sans-serif uppercase label) —
 *     no index number: sections are told apart by their titles
 *   - Right side: mono `N ENTRIES` count chip + animated chevron rotor
 *   - On hover: 2px indigo border-left strip slides in
 *   - On expand: indigo strip stays + label color shifts to accent +
 *     chevron rotates 90° + hairline divider appears under the header
 *
 * Width matches the rest of the page (1100px max), spacing uses the
 * site's 8px base.
 *
 * Colours are semantic tokens (CSS variables keyed off data-theme, set before
 * first paint), never useColorModeValue: that hook renders the dark branch on
 * the server, so light-mode visitors saw borders and surfaces repaint after
 * hydration.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

export type CVSectionShellProps = {
  /** Section label, e.g. "Education" — will be uppercased + tracked */
  label: string
  /** Number shown in the right-side meta chip, e.g. 3 → "3 ENTRIES" */
  count?: number
  /** Optional override for the right-side chip suffix (default "ENTRIES") */
  countSuffix?: string
  /** Panel content (rows for the expanded view) */
  children: React.ReactNode
  /** Start expanded — used for the very first / featured section */
  defaultOpen?: boolean
}

export default function CVSectionShell({
  label,
  count,
  countSuffix = 'ENTRIES',
  children,
  defaultOpen = false,
}: CVSectionShellProps) {
  const border = 'page.border'
  const borderHover = 'page.border-strong'
  const surface = 'page.surface'
  const surfaceHover = 'page.float-bg'
  const labelColor = 'page.fg'
  const labelExpanded = 'accent.text'
  const chevronColor = 'page.fg-subtle'
  const metaColor = 'page.fg-subtle'
  const panelDivider = 'page.border'

  const { expanded, headingLevel, anchorId } = useContext(CVSectionsContext)
  // Local state, not Chakra's Accordion: its items learn their index from
  // descendant registration after mount, so a section that starts open was
  // rendered closed on the server and expanded after hydration (a layout
  // shift). Here the server HTML already has the final state.
  const [isExpanded, setExpanded] = useState(defaultOpen || !!expanded)
  const uid = useId()
  const buttonId = `accordion-button-${uid}`
  const panelId = `accordion-panel-${uid}`

  const button = (
    <Box
      as="button"
      type="button"
      id={buttonId}
      aria-expanded={isExpanded}
      aria-controls={panelId}
      onClick={() => setExpanded((v) => !v)}
      className="chakra-accordion__button"
      display="flex"
      alignItems="center"
      w="100%"
      textAlign="start"
      px={[5, 7]}
      py={[5, 6]}
      // Keyboard focus gets an inset accent ring (the item clips overflow).
      _focus={{ boxShadow: 'none' }}
      _focusVisible={{ outline: 'none', boxShadow: 'inset 0 0 0 2px var(--accent)' }}
    >
      <Flex w="full" align="center" gap={[3, 4]}>
        {/* Label — wraps rather than truncating a long title on phones */}
        <Text
          as="span"
          flex="1"
          minW={0}
          lineHeight="1.35"
          textAlign="left"
          fontWeight={600}
          fontSize={['14px', '15px']}
          letterSpacing="0.06em"
          textTransform="uppercase"
          color={isExpanded ? labelExpanded : labelColor}
          sx={{ transition: 'color 240ms cubic-bezier(0.22,1,0.36,1)' }}
        >
          {label}
        </Text>

        {/* Count chip */}
        {typeof count === 'number' && count > 0 && (
          <Text
            as="span"
            fontFamily={monoFont}
            fontSize={['10px', '11px']}
            color={metaColor}
            letterSpacing="0.08em"
            flexShrink={0}
            display={['none', 'inline']}
          >
            {count} {countSuffix}
          </Text>
        )}

        {/* Custom chevron — single inline svg, rotates on expand */}
        <Box
          as="span"
          flexShrink={0}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          sx={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 320ms cubic-bezier(0.22,1,0.36,1)',
          }}
          color={isExpanded ? labelExpanded : chevronColor}
          aria-hidden
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="5 3 9 7 5 11" />
          </svg>
        </Box>
      </Flex>
    </Box>
  )

  return (
    <Box
      className="chakra-accordion"
      width="100%"
      maxW="1100px"
      id={anchorId}
      // A jump target clears the sticky header.
      sx={anchorId ? { scrollMarginTop: clearOfHeader('8px') } : undefined}
    >
      <Box
        className="chakra-accordion__item"
        border="1px solid"
        borderColor={border}
        bg={surface}
        backdropFilter="blur(8px)"
        mb={4}
        sx={{
          transition: 'border-color 240ms cubic-bezier(0.22,1,0.36,1), background-color 240ms cubic-bezier(0.22,1,0.36,1)',
          position: 'relative',
          // Indigo accent strip on the left edge — hidden by default, slides
          // in on hover, locks in when the section is expanded.
          _before: {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '2px',
            bg: 'var(--accent)',
            transform: 'scaleY(0)',
            transformOrigin: 'top',
            transition: 'transform 320ms cubic-bezier(0.22,1,0.36,1)',
          },
          _hover: {
            borderColor: borderHover,
            bg: surfaceHover,
            _before: { transform: 'scaleY(1)' },
          },
          '&:has([aria-expanded="true"])::before': {
            transform: 'scaleY(1)',
          },
        }}
      >
        {/* The toggle inside a heading when the page asks for one (accordion pattern). */}
        {headingLevel ? (
          <Heading as={headingLevel} m={0} fontSize="inherit" fontWeight="inherit" lineHeight="inherit" letterSpacing="inherit">
            {button}
          </Heading>
        ) : (
          button
        )}

        <Collapse open={isExpanded} id={panelId}>
          <Box
            role="region"
            aria-labelledby={buttonId}
            className="chakra-accordion__panel"
            px={[5, 7]}
            pt={5}
            pb={[6, 7]}
            borderTop="1px solid"
            borderColor={panelDivider}
          >
            {children}
          </Box>
        </Collapse>
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Inner-row shell — every entry inside a CVSectionShell uses this so all
// section types share spacing, dividers, and the right-aligned mono date.
// ---------------------------------------------------------------------------

export type CVRowProps = {
  /** Big line: degree / project title / job title / award name */
  title: React.ReactNode
  /** Smaller line under the title: school / company / org / brief */
  subtitle?: React.ReactNode
  /** Even smaller third line (e.g. project location, "MMM yyyy") */
  meta?: React.ReactNode
  /** Right-aligned period (mono) — usually "MMM yyyy — MMM yyyy" */
  period?: React.ReactNode
  /** Right-aligned mono location under the period */
  location?: React.ReactNode
  /** Bottom block: bullets, skills, etc. */
  children?: React.ReactNode
  /** When true: no top divider (use for the first row) */
  isFirst?: boolean
}

export function CVRow({
  title,
  subtitle,
  meta,
  period,
  location,
  children,
  isFirst,
}: CVRowProps) {
  const divider = 'page.border'
  const titleColor = 'page.fg'
  // Subtitle (school name, company name, project description) carries real
  // content: the secondary text token (≥ 7:1 on paper), not the subtle one.
  const subColor = 'page.fg-secondary'
  const metaColor = 'page.fg-subtle'

  return (
    <Box
      pt={isFirst ? 0 : 6}
      pb={1}
      borderTop={isFirst ? undefined : '1px solid'}
      borderColor={divider}
    >
      <Flex
        direction={['column', 'row']}
        justify="space-between"
        align={['flex-start', 'flex-start']}
        gap={[2, 6]}
      >
        <Box flex="1" minW={0}>
          {/*
            Title is a <div> (Box), not <Text>/<p>, because callers pass JSX
            with block-level children (e.g. WorkExperience renders <Flex>
            inside the title to lay out `{jobTitle} at {companyLink}`).
            A <div> inside <p> is invalid HTML and trips React hydration.
          */}
          <Box
            as="div"
            fontSize={['15px', '17px']}
            fontWeight={600}
            lineHeight="1.3"
            color={titleColor}
            letterSpacing="-0.01em"
          >
            {title}
          </Box>
          {subtitle && (
            <Box as="div" mt={1} fontSize="14px" color={subColor} lineHeight="1.45">
              {subtitle}
            </Box>
          )}
          {meta && (
            <Box
              as="div"
              mt={1}
              fontFamily={monoFont}
              fontSize="11px"
              color={metaColor}
              letterSpacing="0.04em"
            >
              {meta}
            </Box>
          )}
        </Box>

        {(period || location) && (
          <Flex
            direction="column"
            align={['flex-start', 'flex-end']}
            flexShrink={0}
            fontFamily={monoFont}
            fontSize="11px"
            color={metaColor}
            letterSpacing="0.04em"
            lineHeight="1.55"
          >
            {period && <Text>{period}</Text>}
            {location && (
              <Text fontWeight={500} color={subColor}>
                {location}
              </Text>
            )}
          </Flex>
        )}
      </Flex>

      {children && <Box mt={4}>{children}</Box>}
    </Box>
  )
}

/**
 * Small reusable bullet list with optional sub-bullet group below each
 * item — matches WorkExperience.features[].furtherExplanation[] schema.
 */
export function CVBullets({
  items,
}: {
  items: Array<{ description: string; furtherExplanation?: string[] }>
}) {
  const accentDot = 'var(--accent)'
  const text = 'page.fg-prose'
  const subText = 'page.fg-secondary'

  if (!items?.length) return null
  return (
    <Box>
      {items.map((it, i) => (
        <Box key={i} mt={i === 0 ? 0 : 3}>
          <Flex align="flex-start" gap={3}>
            <Box
              w="6px"
              h="6px"
              mt="8px"
              borderRadius="full"
              bg={accentDot}
              flexShrink={0}
              opacity={0.85}
            />
            <Text fontSize="14px" color={text} lineHeight="1.5" flex="1">
              {it.description}
            </Text>
          </Flex>
          {it.furtherExplanation && it.furtherExplanation.length > 0 && (
            <Box ml="18px" mt={1.5}>
              {it.furtherExplanation.map((line, j) => (
                <Text
                  key={j}
                  fontSize="13px"
                  color={subText}
                  lineHeight="1.55"
                  mt={j === 0 ? 0 : 1}
                  sx={{ '&::before': { content: '"↳ "', opacity: 0.6 } }}
                >
                  {line}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

/**
 * Inline tag list (e.g. relatedSkills) — pill tags with mono font.
 */
export function CVTagList({ tags }: { tags: string[] }) {
  const tagBg = 'page.hover'
  const tagFg = 'page.fg-prose'
  const tagBorder = 'page.border'

  if (!tags?.length) return null
  return (
    <Flex wrap="wrap" gap={2} mt={4}>
      {tags.map((t, i) => (
        <Box
          key={i}
          px={2.5}
          py={1}
          fontFamily={monoFont}
          fontSize="10px"
          letterSpacing="0.04em"
          color={tagFg}
          bg={tagBg}
          border="1px solid"
          borderColor={tagBorder}
          borderRadius="4px"
          textTransform="uppercase"
        >
          {t}
        </Box>
      ))}
    </Flex>
  )
}
