import React from 'react'
import NextLink from 'next/link'
import { Box, Flex, Heading, Icon, LinkBox, LinkOverlay, SimpleGrid, Text, useColorModeValue } from '@chakra-ui/react'
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

type Card = { title: string; desc: string; href: string; icon: IconType }

const GROUPS: Array<{ label: string; cards: Card[] }> = [
  {
    label: 'Profile',
    cards: [
      { title: 'CV Studio', desc: 'EN / 中文 CV with per-field visibility, live A4 preview and PDF.', href: '/admin/dashboard?tab=cv', icon: FaFileAlt },
      { title: 'Home page', desc: 'Hero, socials, affiliations, photos, sections and contact copy.', href: '/admin/dashboard?tab=home', icon: FaHome },
    ],
  },
  {
    label: 'Writing',
    cards: [
      { title: 'Blog posts', desc: 'Write and publish MDX articles at /blog.', href: '/admin/blog', icon: FaPenNib },
      { title: 'Case studies', desc: 'Project write-ups shown at /work.', href: '/admin/work', icon: FaBriefcase },
      { title: 'Now', desc: 'What you are focused on right now (/now).', href: '/admin/now', icon: FaClock },
      { title: 'Uses', desc: 'Hardware, editor and stack (/uses).', href: '/admin/uses', icon: FaToolbox },
    ],
  },
  {
    label: 'Safety',
    cards: [
      { title: 'Version history', desc: 'Browse, preview and restore CV & Home snapshots.', href: '/admin/dashboard?tab=versions', icon: FaHistory },
      { title: 'Storage & backups', desc: 'SQLite + R2 mirror, one-click full-site snapshots.', href: '/admin/dashboard?tab=storage', icon: FaHdd },
      { title: 'MongoDB backup', desc: 'Optional external backup target and restore.', href: '/admin/db-config', icon: FaDatabase },
    ],
  },
]

export default function AdminIndex() {
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const borderHover = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.24)')
  const surface = useColorModeValue('rgba(255,255,255,0.75)', 'rgba(255,255,255,0.03)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const iconBg = 'var(--accent-soft)'

  return (
    <>
      <CustomHead title="Admin" description="Admin portal" noindex />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" w="100%" px={{ base: 4, md: 8 }} py={{ base: 8, md: 12 }}>
          <Text
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="10px"
            letterSpacing="0.16em"
            textTransform="uppercase"
            color="var(--accent)"
          >
            Admin
          </Text>
          <Heading as="h1" size="lg" mt={1} letterSpacing="-0.02em">
            What would you like to edit?
          </Heading>
          <Text color={dim} mt={1.5} fontSize="sm">
            Changes go live on save. Every save takes a snapshot you can restore.
          </Text>

          {GROUPS.map((g) => (
            <Box key={g.label} mt={10}>
              <Text
                as="h2"
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="11px"
                letterSpacing="0.12em"
                textTransform="uppercase"
                color={dim}
                mb={3}
              >
                {g.label}
              </Text>
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
                {g.cards.map((c) => (
                  <LinkBox
                    key={c.href}
                    as="article"
                    role="group"
                    border="1px solid"
                    borderColor={border}
                    bg={surface}
                    borderRadius="xl"
                    p={5}
                    transition="border-color 180ms var(--ease-out-quart), transform 180ms var(--ease-out-quart)"
                    _hover={{ borderColor: borderHover, transform: 'translateY(-2px)' }}
                    _focusWithin={{ borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }}
                  >
                    <Flex align="center" justify="space-between" mb={4}>
                      <Flex w="36px" h="36px" borderRadius="lg" bg={iconBg} color="var(--accent)" align="center" justify="center">
                        <Icon as={c.icon} boxSize={4} />
                      </Flex>
                      <ArrowForwardIcon
                        color={dim}
                        transition="transform 180ms var(--ease-out-quart), color 180ms"
                        _groupHover={{ transform: 'translateX(3px)', color: 'var(--accent)' }}
                      />
                    </Flex>
                    <Heading as="h3" size="sm" mb={1.5}>
                      <LinkOverlay as={NextLink} href={c.href} _focus={{ outline: 'none' }}>
                        {c.title}
                      </LinkOverlay>
                    </Heading>
                    <Text color={dim} fontSize="sm" lineHeight="1.55">
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
