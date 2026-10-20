import NextLink from 'next/link'
import { Box, Button, Flex, Text } from '@chakra-ui/react'

import AvailabilityCard from '../Contact/AvailabilityCard'
import type { HomeData } from '../../lib/homeShape'
import { useHomeUi } from './homeUi'

/**
 * The home page's contact section: the owner's availability (only when set
 * in the Home editor) and one "Write to me" link to /contact, where the form
 * lives. Replaces the full form that used to sit here: a 760 px block whose
 * human-check nonce was fetched on every home visit.
 */
export default function ContactBand({ home }: { home?: HomeData | null }) {
  const { t, lang, links } = useHomeUi()
  // The same lede /contact shows when the owner wrote none (lib/uiStrings/contact fallbackLede).
  const lede = (home?.contact?.blurb ?? '').trim() || t.contactBand.fallbackLede
  return (
    <Box>
      <AvailabilityCard availability={home?.availability} mb={4} t={t} zh={lang !== 'en'} />
      <Flex
        align={{ base: 'stretch', sm: 'center' }}
        direction={{ base: 'column', sm: 'row' }}
        justify="space-between"
        gap={{ base: 4, sm: 6 }}
        border="1px solid"
        borderColor="page.border"
        borderRadius="lg"
        bg="page.surface"
        px={{ base: 4, md: 6 }}
        py={{ base: 5, md: 6 }}
      >
        <Text fontSize={{ base: '17px', md: '20px' }} fontWeight={500} letterSpacing="-0.01em" lineHeight="1.35" color="page.fg" maxW="52ch">
          {lede}
        </Text>
        <Button
          as={NextLink}
          href={links.contact}
          flexShrink={0}
          h="44px"
          px={6}
          bg="accent.solid"
          color="accent.fg"
          fontSize="14px"
          fontWeight={500}
          _hover={{ bg: 'accent.solid-hover' }}
          _active={{ bg: 'accent.solid-active' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
        >
          {t.contactBand.writeToMe}&nbsp;
          <span className="nudge" aria-hidden>
            →
          </span>
        </Button>
      </Flex>
    </Box>
  )
}
