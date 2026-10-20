import { Box, Flex, Text, chakra } from '@chakra-ui/react'
import { openCommandPalette } from '../Chrome/paletteEvents'
import { MessageCircleQuestionIcon, QuoteIcon } from '../Icons/ui/ask'
import { cssTransition } from '../../theme/tokens'

/**
 * "Ask Lucian" on /about and /contact: opens the ⌘K palette in Ask mode,
 * where a question (English or Chinese) is answered only with quotes from
 * this site, each linked to its source (components/Search/AskView). Static
 * markup, no data and no script beyond the click: the palette loads the
 * passages when it opens. The Chinese name carries its own lang. Its few
 * words live here (the page chunk does not carry the answer view's copy,
 * lib/ask/copy).
 */

const COPY = {
  title: 'Ask Lucian',
  alt: '问问 Lucian',
  text: 'Questions about his work, studies or projects? Get answers quoted from this site, each with its source. Ask in English or Chinese.',
  button: 'Ask a question…',
  badge: 'Quotes only',
} as const

export default function AskEntry({ id = 'ask-lucian', mb }: { id?: string; mb?: number | Record<string, number> }) {
  const headingId = `${id}-title`
  return (
    <Box
      as="section"
      id={id}
      aria-labelledby={headingId}
      border="1px solid"
      borderColor="page.border"
      borderRadius="card"
      bg="page.bg-elevated"
      px={{ base: 4, md: 5 }}
      py={{ base: 4, md: 5 }}
      mb={mb}
    >
      <Flex align="baseline" gap={2.5} wrap="wrap" mb={1.5}>
        <Box as="span" color="accent.text" display="inline-flex" alignSelf="center">
          <MessageCircleQuestionIcon size="sm" />
        </Box>
        <Text as="h2" id={headingId} textStyle="title-sm" color="page.fg">
          {COPY.title}
        </Text>
        <Text as="span" lang="zh-Hans" fontSize="caption" color="page.fg-secondary">
          {COPY.alt}
        </Text>
      </Flex>
      <Text fontSize="small" lineHeight="1.55" color="page.fg-secondary" maxW="60ch" mb={4}>
        {COPY.text}
      </Text>
      <chakra.button
        type="button"
        onClick={() => openCommandPalette('', 'ask')}
        aria-haspopup="dialog"
        display="flex"
        alignItems="center"
        gap={3}
        w="100%"
        maxW="520px"
        minW={0}
        h="44px"
        px={3.5}
        border="1px solid"
        borderColor="page.border-strong"
        borderRadius="control"
        bg="page.bg"
        color="page.fg-secondary"
        fontSize="small"
        textAlign="left"
        transition={cssTransition(['border-color', 'color'], 'fast')}
        _hover={{ borderColor: 'page.fg-secondary', color: 'page.fg' }}
        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
      >
        <Box as="span" display="inline-flex" flexShrink={0} aria-hidden>
          <QuoteIcon size="sm" />
        </Box>
        <Text as="span" flex={1} minW={0} noOfLines={1}>
          {COPY.button}
        </Text>
        <Text as="span" textStyle="label" color="page.fg-secondary" flexShrink={0} aria-hidden>
          {COPY.badge}
        </Text>
      </chakra.button>
    </Box>
  )
}
