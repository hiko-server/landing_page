import React from 'react'
import {
  Accordion,
  AccordionButton,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'

/**
 * Shared shell for every CV accordion section on /about.
 *
 * The five concrete section files (Education, Project, WorkExperience,
 * CompetitionAwards, Skill, Certificate) only own what's inside the
 * expanded panel — the chrome (numbered index, label, count chip,
 * animated chevron, hairline divider, accent strip on hover/expand)
 * lives here.
 *
 * Design (rauno + engineer + premium):
 *   - Single hairline 1px border, no rounded mega-radius and no boxShadow
 *   - Mono `[NN]` index in muted color, sans-serif uppercase label, both
 *     locked into a single baseline
 *   - Right side: mono `N ENTRIES` count chip + animated chevron rotor
 *   - On hover: 2px indigo border-left strip slides in
 *   - On expand: indigo strip stays + label color shifts to accent +
 *     chevron rotates 90° + hairline divider appears under the header
 *
 * Width matches the rest of the page (1100px max), spacing uses the
 * site's 8px base.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

export type CVSectionShellProps = {
  /** 1-indexed section number, e.g. 1 → "[01]" */
  index?: number
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
  index,
  label,
  count,
  countSuffix = 'ENTRIES',
  children,
  defaultOpen = false,
}: CVSectionShellProps) {
  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const borderHover = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.22)')
  const surface = useColorModeValue('rgba(255,255,255,0.6)', 'rgba(10,10,10,0.45)')
  const surfaceHover = useColorModeValue('rgba(255,255,255,0.85)', 'rgba(10,10,10,0.65)')
  const labelColor = useColorModeValue('gray.900', 'gray.50')
  const labelExpanded = 'var(--accent)'
  const indexColor = useColorModeValue('gray.600', 'gray.500')
  const metaColor = useColorModeValue('gray.600', 'gray.500')
  const panelDivider = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)')

  const padded = (n: number) => String(n).padStart(2, '0')

  return (
    <Accordion
      allowToggle
      defaultIndex={defaultOpen ? [0] : undefined}
      width="100%"
      maxW="1100px"
    >
      <AccordionItem
        border="1px solid"
        borderColor={border}
        bg={surface}
        backdropFilter="blur(8px)"
        mb={4}
        sx={{
          transition: 'border-color 240ms cubic-bezier(0.22,1,0.36,1), background-color 240ms cubic-bezier(0.22,1,0.36,1)',
          position: 'relative',
          // Indigo accent strip on the left edge — hidden by default, slides
          // in on hover, locks in when the item is expanded (Chakra sets
          // aria-expanded=true on the trigger child).
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
        {({ isExpanded }: { isExpanded: boolean }) => (
          <>
            <AccordionButton
              px={[5, 7]}
              py={[5, 6]}
              _hover={{ bg: 'transparent' }}
              _expanded={{ bg: 'transparent' }}
              sx={{ outline: 'none' }}
            >
              <Flex w="full" align="center" gap={[3, 4]}>
                {/* Mono index */}
                {typeof index === 'number' && (
                  <Text
                    as="span"
                    fontFamily={monoFont}
                    fontSize={['10px', '11px']}
                    color={indexColor}
                    letterSpacing="0.08em"
                    flexShrink={0}
                  >
                    [{padded(index)}]
                  </Text>
                )}

                {/* Label */}
                <Text
                  as="span"
                  flex="1"
                  textAlign="left"
                  fontWeight={600}
                  fontSize={['14px', '15px']}
                  letterSpacing="0.06em"
                  textTransform="uppercase"
                  color={isExpanded ? labelExpanded : labelColor}
                  sx={{ transition: 'color 240ms cubic-bezier(0.22,1,0.36,1)' }}
                  noOfLines={1}
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
                  color={isExpanded ? labelExpanded : indexColor}
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
            </AccordionButton>

            <AccordionPanel
              px={[5, 7]}
              pt={5}
              pb={[6, 7]}
              borderTop="1px solid"
              borderColor={panelDivider}
            >
              {children}
            </AccordionPanel>
          </>
        )}
      </AccordionItem>
    </Accordion>
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
  const divider = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)')
  const titleColor = useColorModeValue('gray.900', 'gray.50')
  const subColor = useColorModeValue('gray.600', 'gray.400')
  const metaColor = useColorModeValue('gray.600', 'gray.500')

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
          <Text
            fontSize={['15px', '17px']}
            fontWeight={600}
            lineHeight="1.3"
            color={titleColor}
            letterSpacing="-0.01em"
          >
            {title}
          </Text>
          {subtitle && (
            <Text mt={1} fontSize="14px" color={subColor} lineHeight="1.45">
              {subtitle}
            </Text>
          )}
          {meta && (
            <Text
              mt={1}
              fontFamily={monoFont}
              fontSize="11px"
              color={metaColor}
              letterSpacing="0.04em"
            >
              {meta}
            </Text>
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
  const text = useColorModeValue('gray.700', 'gray.300')
  const subText = useColorModeValue('gray.600', 'gray.400')

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
  const tagBg = useColorModeValue('rgba(0,0,0,0.04)', 'rgba(255,255,255,0.06)')
  const tagFg = useColorModeValue('gray.700', 'gray.300')
  const tagBorder = useColorModeValue('rgba(0,0,0,0.06)', 'rgba(255,255,255,0.08)')

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
