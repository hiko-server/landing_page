import React from 'react'
import NextLink from 'next/link'
import { Box, Flex, Heading, Icon, LinkBox, LinkOverlay, SimpleGrid, Text } from '@chakra-ui/react'
import { ArrowForwardIcon } from '@chakra-ui/icons'
import type { IconType } from 'react-icons'
import {
  FaHome,
  FaFileAlt,
  FaDatabase,
  FaHistory,
  FaPenNib,
  FaBriefcase,
  FaClock,
  FaToolbox,
  FaHdd,
} from 'react-icons/fa'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { Eyebrow, MONO } from '../../components/Admin/shell/ui'

type Card = { title: string; desc: string; href: string; icon: IconType }

const GROUPS: Array<{ label: string; cards: Card[] }> = [
  {
    label: 'Profile',
    cards: [
      {
        title: 'CV Studio',
        desc: 'EN / 中文 CV with per-field visibility, live A4 preview and PDF.',
        href: '/admin/dashboard?tab=cv',
        icon: FaFileAlt,
      },
      {
        title: 'Home page',
        desc: 'Hero, socials, affiliations, photos, sections and contact copy.',
        href: '/admin/dashboard?tab=home',
        icon: FaHome,
      },
    ],
  },
  {
    label: 'Writing',
    cards: [
      {
        title: 'Blog posts',
        desc: 'Write and publish MDX articles at /blog.',
        href: '/admin/blog',
        icon: FaPenNib,
      },
      {
        title: 'Case studies',
        desc: 'Project write-ups shown at /work.',
        href: '/admin/work',
        icon: FaBriefcase,
      },
      {
        title: 'Now',
        desc: 'What you are focused on right now (/now).',
        href: '/admin/now',
        icon: FaClock,
      },
      {
        title: 'Uses',
        desc: 'Hardware, editor and stack (/uses).',
        href: '/admin/uses',
        icon: FaToolbox,
      },
    ],
  },
  {
    label: 'Safety',
    cards: [
      {
        title: 'Version history',
        desc: 'Browse, preview and restore CV & Home snapshots.',
        href: '/admin/dashboard?tab=versions',
        icon: FaHistory,
      },
      {
        title: 'Storage & backups',
        desc: 'SQLite + R2 mirror, one-click full-site snapshots.',
        href: '/admin/dashboard?tab=storage',
        icon: FaHdd,
      },
      {
        title: 'MongoDB backup',
        desc: 'Optional external backup target and restore.',
        href: '/admin/db-config',
        icon: FaDatabase,
      },
    ],
  },
]

export default function AdminIndex() {
  return (
    <>
      <CustomHead title="Admin" description="Admin portal" noindex />
      <HeaderFooter>
        <Box
          maxW="var(--container-content)"
          mx="auto"
          w="100%"
          px={{ base: 4, md: 8 }}
          py={{ base: 8, md: 12 }}
        >
          <Eyebrow accent>[admin]</Eyebrow>
          <Heading
            as="h1"
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight={600}
            mt={1}
            letterSpacing="-0.03em"
          >
            What would you like to edit?
          </Heading>
          <Text color="page.fg-secondary" mt={1.5} fontSize="sm">
            Changes go live on save. Every save takes a snapshot you can restore.
          </Text>

          {GROUPS.map((g, gi) => (
            <Box as="section" key={g.label} mt={10} aria-labelledby={`admin-group-${gi}`}>
              <Text
                as="h2"
                id={`admin-group-${gi}`}
                fontFamily={MONO}
                fontSize="11px"
                letterSpacing="0.12em"
                textTransform="uppercase"
                color="page.fg-secondary"
                mb={3}
                pb={2}
                borderBottom="1px solid"
                borderColor="page.border"
              >
                <Box as="span" color="accent.500" mr={2}>
                  [{String(gi + 1).padStart(2, '0')}]
                </Box>
                {g.label}
              </Text>
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
                {g.cards.map((c) => (
                  <LinkBox
                    key={c.href}
                    as="article"
                    role="group"
                    border="1px solid"
                    borderColor="page.border"
                    bg="page.surface"
                    borderRadius="xl"
                    p={5}
                    transition="border-color 180ms var(--ease-out-quart), transform 180ms var(--ease-out-quart)"
                    _hover={{ borderColor: 'page.border-strong', transform: 'translateY(-2px)' }}
                    _focusWithin={{
                      borderColor: 'accent.500',
                      boxShadow: '0 0 0 1px var(--accent)',
                    }}
                    sx={{
                      '@media (prefers-reduced-motion: reduce)': {
                        transition: 'border-color 180ms',
                        '&:hover': { transform: 'none' },
                      },
                    }}
                  >
                    <Flex align="center" justify="space-between" mb={4}>
                      <Flex
                        w="36px"
                        h="36px"
                        borderRadius="lg"
                        bg="var(--accent-soft)"
                        color="accent.500"
                        align="center"
                        justify="center"
                      >
                        <Icon as={c.icon} boxSize={4} aria-hidden />
                      </Flex>
                      <ArrowForwardIcon
                        aria-hidden
                        color="page.muted"
                        transition="transform 180ms var(--ease-out-quart), color 180ms"
                        _groupHover={{ transform: 'translateX(3px)', color: 'accent.500' }}
                      />
                    </Flex>
                    <Heading as="h3" size="sm" mb={1.5}>
                      <LinkOverlay as={NextLink} href={c.href} _focusVisible={{ outline: 'none' }}>
                        {c.title}
                      </LinkOverlay>
                    </Heading>
                    <Text color="page.fg-secondary" fontSize="sm" lineHeight="1.55">
                      {c.desc}
                    </Text>
                  </LinkBox>
                ))}
              </SimpleGrid>
            </Box>
          ))}
        </Box>
      </HeaderFooter>
    </>
  )
}
