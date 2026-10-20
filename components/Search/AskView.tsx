import React from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import type { AskCopy } from '../../lib/ask/copy'
import type { AnswerGroup } from '../../lib/ask/engine'
import type { Segment } from '../../lib/search/query'
import { answerSignature, type AskOption, type AskViewState } from '../../lib/ask/view'
import { ArrowUpRightIcon, CornerDownLeftIcon, MailIcon, MessageCircleQuestionIcon, QuoteIcon } from '../Icons/ui/ask'
import { SearchIcon } from '../Icons/ui/chrome'
import { HIDE_ON_COARSE_POINTER } from '../Chrome/platform'

/**
 * "Ask Lucian" — the palette's answer view (J1). Renders the options of
 * lib/ask/view askOptions() in the same order, so the palette's ↑ / ↓ / ↵
 * and aria-activedescendant match what is on screen:
 *
 *   no question   what Ask is (quotes only, nothing generated) and the
 *                 suggested questions this site answers
 *   an answer     the sources as numbered citation chips, each with its
 *                 quotes — verbatim, matched words marked — or an entry's
 *                 facts line; then "Ask Lucian directly"
 *   no answer     says so plainly and offers the contact form (the
 *                 question moves into the message) or a site search
 *
 * Every quote is a link to its passage (a text fragment highlights it on
 * the page), so ⌘ / Ctrl / middle click opens it in a new tab. A new answer
 * reveals source by source and quote by quote — a soft left-to-right sweep,
 * like text arriving — once per answer, not per keystroke; under reduced
 * motion it is simply there. While the question is still being typed the
 * previous answer dims.
 */

export type AskViewProps = {
  state: AskViewState
  options: readonly AskOption[]
  copy: AskCopy
  /** The answer is behind the typed question (typing). */
  pending: boolean
  activeIdx: number
  optId: (index: number) => string
  listId: string
  onHover: (index: number) => void
  /** Run an option (Enter or click). A click event is passed so modified clicks can open links natively. */
  onRun: (option: AskOption, event?: React.MouseEvent) => void
}

const reveal = keyframes`
  from { opacity: 0; transform: translateY(3px); mask-position: 100% 0; -webkit-mask-position: 100% 0; }
  to { opacity: 1; transform: none; mask-position: 0 0; -webkit-mask-position: 0 0; }
`

const shimmer = keyframes`
  from { background-position: 100% 0; }
  to { background-position: 0 0; }
`

/** Staggered reveal of answer parts (`--i` = order); none under reduced motion. */
const REVEAL_SX = {
  '@media (prefers-reduced-motion: no-preference)': {
    '.ask-reveal': {
      maskImage: 'linear-gradient(90deg, #000 42%, transparent 58%)',
      WebkitMaskImage: 'linear-gradient(90deg, #000 42%, transparent 58%)',
      maskSize: '260% 100%',
      WebkitMaskSize: '260% 100%',
      animation: `${reveal} var(--duration-slow) var(--ease-standard) both`,
      animationDelay: 'calc(var(--i, 0) * 55ms)',
    },
  },
} as const

function Marked({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <Box as="mark" key={i} bg="transparent" color="accent.text" fontWeight={600}>
            {seg.text}
          </Box>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </>
  )
}

/** A numbered citation chip. */
function Cite({ n, active }: { n: number; active?: boolean }) {
  return (
    <Box
      as="span"
      aria-hidden
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      minW="20px"
      h="20px"
      px={1}
      borderRadius="control"
      border="1px solid"
      borderColor={active ? 'var(--accent-ring)' : 'page.border-strong'}
      bg={active ? 'var(--accent-soft)' : 'page.bg-elevated'}
      color={active ? 'accent.text' : 'page.fg-secondary'}
      fontFamily="mono"
      fontSize="label"
      lineHeight="1"
      className="tnum"
      flexShrink={0}
    >
      {n}
    </Box>
  )
}

function EnterHint({ label, lang }: { label: string; lang: string }) {
  return (
    <Flex as="span" aria-hidden align="center" gap={1} color="page.fg-secondary" fontFamily="mono" fontSize="label" flexShrink={0} sx={HIDE_ON_COARSE_POINTER} lang={lang}>
      <CornerDownLeftIcon size="xs" />
      {label}
    </Flex>
  )
}

/** One option row: a link (quotes) or an action, highlighted while active. */
function OptionRow({
  index,
  active,
  optId,
  onHover,
  onClick,
  href,
  children,
  reveal: revealOrder,
  align = 'flex-start',
  lang,
}: {
  index: number
  active: boolean
  optId: (index: number) => string
  onHover: (index: number) => void
  onClick: (e: React.MouseEvent) => void
  href?: string
  children: React.ReactNode
  reveal?: number
  align?: 'flex-start' | 'center'
  /** The language of the row's words when it differs from the view around it. */
  lang?: string
}) {
  return (
    <Flex
      as={href ? 'a' : 'div'}
      {...(href ? { href, tabIndex: -1 } : {})}
      id={optId(index)}
      lang={lang}
      data-idx={index}
      role="option"
      aria-selected={active}
      onMouseMove={() => !active && onHover(index)}
      onClick={onClick}
      className={revealOrder !== undefined ? 'ask-reveal' : undefined}
      sx={revealOrder !== undefined ? { '--i': String(revealOrder) } : undefined}
      align={align}
      gap={3}
      px={3}
      py={2.5}
      minH="44px"
      borderRadius="control"
      cursor="pointer"
      color="page.fg"
      textDecoration="none"
      bg={active ? 'var(--accent-soft)' : 'transparent'}
      boxShadow={active ? 'inset 2px 0 0 var(--accent)' : 'none'}
      _hover={{ textDecoration: 'none' }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px' }}
    >
      {children}
    </Flex>
  )
}

function sourceLabel(group: AnswerGroup, copy: AskCopy): { kind: string; where: string } {
  const kind = copy.kind[group.kind] || group.page
  const where = [group.kind === 'cv' || group.kind === 'page' ? '' : group.page, group.section, group.title].filter(Boolean).join(' · ')
  return { kind, where: where || group.page }
}

export default function AskView({ state, options, copy, pending, activeIdx, optId, listId, onHover, onRun }: AskViewProps) {
  // The combobox always controls a listbox, empty while there is nothing to choose.
  const emptyList = <Box id={listId} role="listbox" aria-label={copy.name} />

  if (state.failed) {
    return (
      <Flex direction="column" align="center" textAlign="center" py={10} px={6} gap={2} color="page.fg-secondary" lang={copy.lang}>
        <Text fontSize="small">{copy.unavailable}</Text>
        {emptyList}
      </Flex>
    )
  }

  if (!state.ready) {
    return (
      <Box px={3} py={4} lang={copy.lang}>
        {emptyList}
        {[92, 78, 64].map((w, i) => (
          <Box
            key={i}
            h="12px"
            w={`${w}%`}
            mb={3}
            borderRadius="pill"
            bgGradient="linear(90deg, var(--chakra-colors-page-bg-elevated) 30%, var(--chakra-colors-page-bg-overlay) 50%, var(--chakra-colors-page-bg-elevated) 70%)"
            bgSize="300% 100%"
            aria-hidden
            sx={{ '@media (prefers-reduced-motion: no-preference)': { animation: `${shimmer} 1.2s var(--ease-standard) infinite` } }}
          />
        ))}
        <Text fontSize="caption" color="page.fg-secondary" mt={1}>
          {copy.loading}
        </Text>
      </Box>
    )
  }

  const { result } = state
  const question = state.question.trim()
  const hasAnswer = !!question && (result.status === 'answered' || result.status === 'partial')
  const indexOf = (id: string) => options.findIndex((o) => o.id === id)

  // An option's words are in the copy's language; a suggested question keeps its own (`labelLang`).
  const renderSimpleOption = (option: AskOption, icon: React.ReactNode, label: React.ReactNode, hint?: string, labelLang?: string, enter: string = copy.openHint) => {
    const i = indexOf(option.id)
    const active = i === activeIdx
    return (
      <OptionRow key={option.id} index={i} active={active} optId={optId} onHover={onHover} onClick={(e) => onRun(option, e)} align="center" lang={copy.lang}>
        <Box as="span" color={active ? 'accent.text' : 'page.fg-secondary'} display="inline-flex" flexShrink={0}>
          {icon}
        </Box>
        <Box flex={1} minW={0}>
          <Text as="span" display="block" fontSize="small" lineHeight="1.4" lang={labelLang} noOfLines={2}>
            {label}
          </Text>
          {hint ? (
            <Text as="span" display="block" fontSize="caption" color="page.fg-secondary" mt={0.5} noOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </Box>
        {active ? <EnterHint label={enter} lang={copy.lang} /> : null}
      </OptionRow>
    )
  }

  // ── No question yet, or nothing specific asked ─────────────────────────
  if (!hasAnswer && result.status !== 'none') {
    const suggestions = options.filter((o): o is Extract<AskOption, { kind: 'suggestion' }> => o.kind === 'suggestion')
    return (
      <Box lang={copy.lang}>
        <Flex gap={3} px={3} pt={3} pb={2} align="flex-start">
          <Box as="span" color="accent.text" mt="3px" display="inline-flex" flexShrink={0}>
            <QuoteIcon size="sm" />
          </Box>
          <Text fontSize="small" lineHeight="1.55" color={question && result.status === 'vague' ? 'page.fg' : 'page.fg-secondary'}>
            {question && result.status === 'vague' ? copy.vague : copy.intro}
          </Text>
        </Flex>
        {suggestions.length ? (
          <>
            <Text id={`${listId}-label`} textStyle="label" letterSpacing="caps-wide" color="page.fg-secondary" px={3} pt={3} pb={1.5}>
              {copy.tryAsking}
            </Text>
            <Box id={listId} role="listbox" aria-labelledby={`${listId}-label`}>
              {suggestions.map((s) => renderSimpleOption(s, <MessageCircleQuestionIcon size="sm" />, s.question, undefined, s.lang === 'zh' ? 'zh-Hans' : 'en', copy.askHint))}
            </Box>
          </>
        ) : (
          emptyList
        )}
      </Box>
    )
  }

  // ── Nothing on the site answers it ─────────────────────────────────────
  if (result.status === 'none') {
    const contact = options.find((o) => o.kind === 'contact')
    const search = options.find((o) => o.kind === 'search')
    return (
      <Box key={`none:${question}`} sx={REVEAL_SX} lang={copy.lang}>
        <Flex direction="column" align="center" textAlign="center" pt={8} pb={5} px={6} gap={2} className="ask-reveal">
          <Flex
            align="center"
            justify="center"
            w="40px"
            h="40px"
            mb={1}
            borderRadius="pill"
            border="1px solid"
            borderColor="page.border-strong"
            color="page.fg-secondary"
          >
            <MessageCircleQuestionIcon size="md" />
          </Flex>
          <Text fontSize="small" fontWeight={500} color="page.fg">
            {copy.none}
          </Text>
          <Text fontSize="caption" color="page.fg-secondary" maxW="34ch">
            {copy.noneHint}
          </Text>
        </Flex>
        <Box id={listId} role="listbox" aria-label={copy.none} borderTop="1px solid" borderColor="page.border" pt={2}>
          {contact ? renderSimpleOption(contact, <MailIcon size="sm" />, copy.askDirectly, copy.askDirectlyHint, undefined, copy.writeHint) : null}
          {search ? renderSimpleOption(search, <SearchIcon size="sm" />, copy.searchInstead(question), undefined, undefined, copy.searchHint) : null}
        </Box>
      </Box>
    )
  }

  // ── An answer ──────────────────────────────────────────────────────────
  const contact = options.find((o) => o.kind === 'contact')
  let order = 1
  return (
    <Box
      key={answerSignature(result)}
      sx={REVEAL_SX}
      opacity={pending ? 0.55 : 1}
      transition="opacity var(--duration-fast) var(--ease-standard)"
      lang={copy.lang}
    >
      <Flex align="center" justify="space-between" gap={3} px={3} pt={3} pb={2} className="ask-reveal" sx={{ '--i': '0' }}>
        <Flex align="center" gap={2} minW={0} color="page.fg-secondary">
          <QuoteIcon size="xs" />
          <Text as="span" fontSize="caption" noOfLines={1}>
            {result.status === 'partial' ? copy.partial(result.missing.join(result.lang === 'zh' ? '、' : ', ')) : copy.answerFrom(result.groups.length)}
          </Text>
        </Flex>
        <Text as="span" textStyle="label" color="page.fg-secondary" flexShrink={0}>
          {copy.quotesOnly}
        </Text>
      </Flex>

      <Box id={listId} role="listbox" aria-label={copy.name}>
        {result.groups.map((group, gi) => {
          const n = gi + 1
          const headingId = `${listId}-source-${gi}`
          const { kind, where } = sourceLabel(group, copy)
          const first = group.quotes[0]
          return (
            <Box key={group.source} role="group" aria-labelledby={headingId} mb={2}>
              {/* The group's label: a citation chip. Not a link (only options live in a listbox) —
                  a click opens the first quote, as its ↵ does. */}
              <Flex
                id={headingId}
                onClick={(e: React.MouseEvent) => {
                  const option = first && options.find((o) => o.kind === 'quote' && o.quote === first)
                  if (option) onRun(option, e)
                }}
                cursor="pointer"
                align="center"
                gap={2}
                mx={3}
                mt={2}
                mb={1}
                minW={0}
                maxW="calc(100% - 24px)"
                w="fit-content"
                px={2}
                py={1}
                borderRadius="pill"
                border="1px solid"
                borderColor="page.border"
                bg="page.bg-elevated"
                color="page.fg-secondary"
                className="ask-reveal"
                sx={{ '--i': String(order++) }}
                _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
                lang={group.lang}
              >
                <Cite n={n} />
                <Text as="span" textStyle="label" color="page.fg" flexShrink={0}>
                  {kind}
                </Text>
                <Text as="span" fontSize="caption" noOfLines={1} minW={0}>
                  {where}
                </Text>
                {group.more > 0 ? (
                  <Text as="span" fontSize="caption" color="page.fg-secondary" flexShrink={0} display={{ base: 'none', sm: 'inline' }}>
                    · {copy.more(group.more)}
                  </Text>
                ) : null}
                <Box as="span" display="inline-flex" flexShrink={0} aria-hidden>
                  <ArrowUpRightIcon size="xs" />
                </Box>
              </Flex>
              <Box ml={3} pl={0} borderLeft="1px solid" borderColor="page.border">
                {group.quotes.map((quote) => {
                  const option = options.find((o) => o.kind === 'quote' && o.quote === quote)
                  if (!option) return null
                  const i = indexOf(option.id)
                  const active = i === activeIdx
                  const meta = quote.passage.meta
                  return (
                    <OptionRow
                      key={option.id}
                      index={i}
                      active={active}
                      optId={optId}
                      onHover={onHover}
                      onClick={(e) => onRun(option, e)}
                      href={quote.href}
                      reveal={order++}
                    >
                      <Box flex={1} minW={0} lang={quote.passage.lang}>
                        {meta ? (
                          <Text as="span" display="block" fontSize="caption" lineHeight="1.6" color="page.fg-secondary" wordBreak="break-word">
                            <Marked segments={quote.segments} />
                          </Text>
                        ) : (
                          <Text as="span" display="block" fontSize="small" lineHeight="1.6" color="page.fg" wordBreak="break-word">
                            <Text as="span" aria-hidden color="page.fg-secondary">
                              “
                            </Text>
                            <Marked segments={quote.segments} />
                            <Text as="span" aria-hidden color="page.fg-secondary">
                              ”
                            </Text>
                          </Text>
                        )}
                        <Box as="span" className="sr-only">
                          {` — ${copy.sourceLabel} ${n}: ${kind}, ${where}`}
                        </Box>
                      </Box>
                      <Flex direction="column" align="flex-end" gap={1.5} flexShrink={0} pt="1px">
                        <Cite n={n} active={active} />
                      </Flex>
                    </OptionRow>
                  )
                })}
              </Box>
            </Box>
          )
        })}
        {contact ? (
          <Box borderTop="1px solid" borderColor="page.border" mt={3} pt={2} className="ask-reveal" sx={{ '--i': String(order++) }}>
            {renderSimpleOption(contact, <MailIcon size="sm" />, copy.askDirectly, `${copy.notQuite} ${copy.askDirectlyHint}`, undefined, copy.writeHint)}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
