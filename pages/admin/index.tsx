import React, { useCallback, useEffect, useState } from 'react'
import NextLink from 'next/link'
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  LinkBox,
  LinkOverlay,
  SimpleGrid,
  Skeleton,
  Text,
  useToast,
} from '@chakra-ui/react'
import { ArrowForwardIcon, WarningTwoIcon } from '@chakra-ui/icons'
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
  FaInbox,
  FaChartLine,
  FaShieldAlt,
  FaHeartbeat,
  FaUser,
} from 'react-icons/fa'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { Eyebrow, MONO, outlineButtonProps } from '../../components/Admin/shell/ui'
import ShortcutsOverlay from '../../components/Admin/shell/ShortcutsOverlay'
import type { AdminOverview } from '../api/admin/overview'

type CardKey = 'inbox' | 'cv' | 'home' | 'about' | 'blog' | 'work' | 'now' | 'uses' | 'analytics' | 'versions' | 'storage' | 'mongo' | 'security' | 'system'
type Card = { key: CardKey; title: string; desc: string; href: string; icon: IconType }

const GROUPS: Array<{ label: string; cards: Card[] }> = [
  {
    label: 'Messages',
    cards: [
      {
        key: 'inbox',
        title: 'Inbox',
        desc: 'Messages from the contact form — kept even when email isn’t configured.',
        href: '/admin/dashboard?tab=inbox',
        icon: FaInbox,
      },
      {
        key: 'analytics',
        title: 'Analytics',
        desc: 'Cookieless page views, referrers and real-user Web Vitals.',
        href: '/admin/dashboard?tab=analytics',
        icon: FaChartLine,
      },
    ],
  },
  {
    label: 'Profile',
    cards: [
      { key: 'cv', title: 'CV Studio', desc: 'EN / 中文 CV with per-field visibility, live A4 preview and PDF.', href: '/admin/dashboard?tab=cv', icon: FaFileAlt },
      { key: 'home', title: 'Home page', desc: 'Hero, highlights, section order, logos, photos, availability and open source.', href: '/admin/dashboard?tab=home', icon: FaHome },
      { key: 'about', title: 'About bio', desc: 'Your story in your own words, at the top of /about.', href: '/admin/about', icon: FaUser },
    ],
  },
  {
    label: 'Writing',
    cards: [
      { key: 'blog', title: 'Blog posts', desc: 'Write and publish MDX articles at /blog.', href: '/admin/blog', icon: FaPenNib },
      { key: 'work', title: 'Case studies', desc: 'Project write-ups shown at /work.', href: '/admin/work', icon: FaBriefcase },
      { key: 'now', title: 'Now', desc: 'What you are focused on right now (/now).', href: '/admin/now', icon: FaClock },
      { key: 'uses', title: 'Uses', desc: 'Hardware, editor and stack (/uses).', href: '/admin/uses', icon: FaToolbox },
    ],
  },
  {
    label: 'Safety',
    cards: [
      { key: 'versions', title: 'Version history', desc: 'Browse, preview and restore CV & Home snapshots.', href: '/admin/dashboard?tab=versions', icon: FaHistory },
      { key: 'storage', title: 'Storage & backups', desc: 'SQLite + R2 mirror, one-click full-site snapshots.', href: '/admin/dashboard?tab=storage', icon: FaHdd },
      { key: 'mongo', title: 'MongoDB backup', desc: 'Optional external backup target and restore.', href: '/admin/db-config', icon: FaDatabase },
      { key: 'security', title: 'Security', desc: 'Passkeys, recovery codes, signed-in browsers and sign-in history.', href: '/admin/security', icon: FaShieldAlt },
      { key: 'system', title: 'System', desc: 'Server health, restore drills and errors from the site, without third parties.', href: '/admin/system', icon: FaHeartbeat },
    ],
  },
]

const WEEK_HOURS = 24 * 7
const rtf = () => new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })

/** "3 hr. ago" / "in 21 hr." relative to `now`. */
function relTime(ms: number, now: number): string {
  const diff = Math.round((ms - now) / 1000)
  const abs = Math.abs(diff)
  if (abs < 45) return diff <= 0 ? 'just now' : 'in a moment'
  if (abs < 3600) return rtf().format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf().format(Math.round(diff / 3600), 'hour')
  return rtf().format(Math.round(diff / 86400), 'day')
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function lastEditOf(o: AdminOverview, kind: AdminOverview['lastEdits'][number]['kind'], ref?: string) {
  return o.lastEdits.find((e) => e.kind === kind && (!ref || e.ref === ref))?.updatedAt
}

/** One-line live detail per card; null when there is nothing real to say. */
function cardDetail(key: CardKey, o: AdminOverview, now: number): string | null {
  switch (key) {
    case 'inbox':
      return o.inbox.total ? `${o.inbox.unread} unread of ${o.inbox.total}` : 'No messages yet'
    case 'cv': {
      const at = lastEditOf(o, 'cv')
      const r = o.cvReadiness
      const checks = r
        ? r.open
          ? `${plural(r.open, 'readiness check')} to review${r.high ? ` (${r.high} to fix first)` : ''}`
          : 'Readiness checks pass'
        : ''
      return [at ? `Edited ${relTime(at, now)}` : '', checks].filter(Boolean).join(' · ') || null
    }
    case 'home': {
      const at = lastEditOf(o, 'home')
      return at ? `Edited ${relTime(at, now)}` : null
    }
    case 'blog':
      return `${o.posts.published} published · ${plural(o.posts.drafts, 'draft')}`
    case 'work':
      return `${o.work.published} published · ${plural(o.work.drafts, 'draft')}`
    case 'now':
      return o.pages.nowEmpty ? 'Auto-generated from your CV and writing' : 'Written by you'
    case 'uses':
      return o.pages.usesEmpty ? 'Auto-generated from the site’s stack' : 'Written by you'
    case 'about': {
      if (o.pages.aboutEmpty) return 'Not written yet · /about shows no bio'
      const at = lastEditOf(o, 'page', 'about')
      return at ? `Written by you · edited ${relTime(at, now)}` : 'Written by you'
    }
    case 'storage': {
      if (!o.backup.lastAt) return o.backup.scheduled ? 'No backup yet · scheduled' : 'No backup yet'
      const next = o.backup.scheduled && o.backup.nextAt ? ` · next ${relTime(o.backup.nextAt, now)}` : ''
      return `Last backup ${relTime(o.backup.lastAt, now)}${o.backup.lastOk === false ? ' (failed)' : ''}${next}`
    }
    case 'security':
      if (!o.security) return null
      return o.security.passkeys
        ? `${plural(o.security.passkeys, 'passkey')} · ${o.security.passkeyRequired ? 'passkey required' : 'password allowed'}`
        : 'No passkey yet'
    case 'system': {
      const parts: string[] = []
      if (o.errors) parts.push(o.errors.open ? plural(o.errors.open, 'open error') : 'No open errors')
      if (o.restoreDrill) parts.push(`drill ${o.restoreDrill.status} ${relTime(o.restoreDrill.ranAt, now)}`)
      return parts.length ? parts.join(' · ') : null
    }
    default:
      return null
  }
}

type Attention = { id: string; text: string; action?: React.ReactNode }

type LoadState = 'loading' | 'ready' | 'error'

function StatCell({ index, label, value, sub }: { index: number; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Box px={4} py={3} borderRight={{ base: 'none', md: '1px solid' }} borderBottom={{ base: '1px solid', md: 'none' }} borderColor="page.border" _last={{ border: 'none' }} minW={0}>
      <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary">
        <Box as="span" color="accent.text" mr={1.5}>
          [{String(index).padStart(2, '0')}]
        </Box>
        {label}
      </Text>
      <Text fontFamily={MONO} fontSize="xl" fontWeight={600} className="tnum" mt={1} lineHeight="1.2">
        {value}
      </Text>
      {sub ? (
        <Text fontSize="xs" color="page.fg-secondary" noOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Box>
  )
}

export default function AdminIndex() {
  const toast = useToast()
  const [state, setState] = useState<LoadState>('loading')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [now, setNow] = useState(0)
  const [backingUp, setBackingUp] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store', credentials: 'same-origin' })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as AdminOverview
      if (!body || typeof body !== 'object' || !body.inbox) throw new Error('bad body')
      setOverview(body)
      setNow(Date.now())
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const backUpNow = async () => {
    setBackingUp(true)
    try {
      const res = await fetch('/api/admin/storage/backup', { method: 'POST', credentials: 'same-origin' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`)
      toast({ status: 'success', title: 'Backup created', position: 'bottom-right' })
      await load()
    } catch (err) {
      toast({ status: 'error', title: 'Backup failed', description: err instanceof Error ? err.message : String(err), position: 'bottom-right' })
    } finally {
      setBackingUp(false)
    }
  }

  const attention: Attention[] = []
  if (overview) {
    const o = overview
    if (o.inbox.unread > 0) {
      attention.push({
        id: 'inbox',
        text: `${plural(o.inbox.unread, 'unread message')} in the inbox.`,
        action: (
          <Button as={NextLink} href="/admin/dashboard?tab=inbox" size="xs" {...outlineButtonProps}>
            Open Inbox
          </Button>
        ),
      })
    }
    if (o.cvReadiness && o.cvReadiness.high > 0) {
      attention.push({
        id: 'cv-readiness',
        text: `The CV has ${plural(o.cvReadiness.high, 'readiness issue')} to fix first (contradictions or out-of-date claims).`,
        action: (
          <Button as={NextLink} href="/admin/dashboard?tab=cv&panel=readiness" size="xs" {...outlineButtonProps}>
            Review
          </Button>
        ),
      })
    }
    if (o.backup.ageHours === null || o.backup.ageHours > WEEK_HOURS) {
      attention.push({
        id: 'backup',
        text: o.backup.lastAt ? `No backup in the last 7 days (last ${relTime(o.backup.lastAt, now)}).` : 'No full-site backup exists yet.',
        action: (
          <Button size="xs" {...outlineButtonProps} onClick={() => void backUpNow()} isLoading={backingUp} loadingText="Backing up">
            Back up now
          </Button>
        ),
      })
    }
    if (o.r2.configured && o.r2.pending > 0) {
      attention.push({
        id: 'r2',
        text: `${plural(o.r2.pending, 'change')} not yet mirrored to R2.`,
        action: (
          <Button as={NextLink} href="/admin/dashboard?tab=storage" size="xs" {...outlineButtonProps}>
            Storage
          </Button>
        ),
      })
    }
    if (o.errors && o.errors.new24h > 0) {
      attention.push({
        id: 'errors',
        text: `${plural(o.errors.new24h, 'new error')} in the last 24 hours.`,
        action: (
          <Button as={NextLink} href="/admin/system?view=errors" size="xs" {...outlineButtonProps}>
            Errors
          </Button>
        ),
      })
    }
    if (o.restoreDrill?.status === 'failed') {
      attention.push({
        id: 'drill',
        text: 'The last restore drill failed: the newest backup may not restore.',
        action: (
          <Button as={NextLink} href="/admin/system" size="xs" {...outlineButtonProps}>
            System
          </Button>
        ),
      })
    }
    if (o.security && o.security.passkeys === 0) {
      attention.push({
        id: 'passkey',
        text: 'Sign-in uses the password only: add a passkey (Face ID, Touch ID, Windows Hello).',
        action: (
          <Button as={NextLink} href="/admin/security" size="xs" {...outlineButtonProps}>
            Security
          </Button>
        ),
      })
    }
    if (!o.config.smtp) attention.push({ id: 'smtp', text: 'Messages are stored, not emailed: set SMTP_* in .env.' })
    if (!o.config.githubToken) {
      attention.push({
        id: 'github',
        text: 'GitHub stats share the 60 req/h anonymous limit and the contribution graph uses a public mirror: set GITHUB_TOKEN in .env.',
      })
    }
    if (o.pages.nowEmpty) {
      attention.push({
        id: 'now',
        text: '/now is auto-generated · write your own.',
        action: (
          <Button as={NextLink} href="/admin/now" size="xs" {...outlineButtonProps}>
            Write /now
          </Button>
        ),
      })
    }
    if (o.pages.usesEmpty) {
      attention.push({
        id: 'uses',
        text: '/uses is auto-generated · write your own.',
        action: (
          <Button as={NextLink} href="/admin/uses" size="xs" {...outlineButtonProps}>
            Write /uses
          </Button>
        ),
      })
    }
    if (o.pages.aboutEmpty) {
      attention.push({
        id: 'about',
        text: '/about has no bio yet · visitors see only your CV there.',
        action: (
          <Button as={NextLink} href="/admin/about" size="xs" {...outlineButtonProps}>
            Write your bio
          </Button>
        ),
      })
    }
  }

  return (
    <>
      <CustomHead title="Admin" description="Admin portal" noindex />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" w="100%" px={{ base: 4, md: 8 }} py={{ base: 8, md: 12 }}>
          <Flex align="flex-start" justify="space-between" gap={3}>
            <Box>
              <Eyebrow accent>[admin]</Eyebrow>
              <Heading as="h1" fontSize={{ base: '2xl', md: '3xl' }} fontWeight={600} mt={1} letterSpacing="-0.03em">
                What would you like to edit?
              </Heading>
              <Text color="page.fg-secondary" mt={1.5} fontSize="sm">
                Changes go live on save. Every save takes a snapshot you can restore.
              </Text>
            </Box>
            <ShortcutsOverlay />
          </Flex>

          {/* Status strip: live numbers, or skeletons while loading; hidden if the overview can't load. */}
          {state !== 'error' ? (
            <Box as="section" aria-label="Site status" mt={8} border="1px solid" borderColor="page.border" borderRadius="xl" overflow="hidden">
              {state === 'loading' || !overview ? (
                <SimpleGrid columns={{ base: 1, md: 4 }} aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <Box key={i} px={4} py={3}>
                      <Skeleton h="10px" w="60%" />
                      <Skeleton h="22px" w="40%" mt={2} />
                    </Box>
                  ))}
                </SimpleGrid>
              ) : (
                <SimpleGrid columns={{ base: 1, md: 4 }}>
                  <StatCell index={1} label="Unread" value={overview.inbox.unread} sub={`of ${plural(overview.inbox.total, 'message')}`} />
                  <StatCell index={2} label="Posts" value={overview.posts.published} sub={`${plural(overview.posts.drafts, 'draft')}`} />
                  <StatCell index={3} label="Case studies" value={overview.work.published} sub={`${plural(overview.work.drafts, 'draft')}`} />
                  <StatCell
                    index={4}
                    label="Last backup"
                    value={overview.backup.lastAt ? relTime(overview.backup.lastAt, now) : '—'}
                    sub={overview.backup.scheduled ? 'scheduled' : 'manual only'}
                  />
                </SimpleGrid>
              )}
            </Box>
          ) : null}

          {attention.length ? (
            <Box as="section" aria-labelledby="admin-attention" mt={6}>
              <Text as="h2" id="admin-attention" fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" mb={2}>
                Needs attention
              </Text>
              <Box as="ul" listStyleType="none" border="1px solid" borderColor="page.border" borderRadius="lg">
                {attention.map((a) => (
                  <Flex
                    as="li"
                    key={a.id}
                    align="center"
                    gap={3}
                    px={4}
                    py={2.5}
                    borderBottom="1px solid"
                    borderColor="page.border"
                    _last={{ borderBottom: 'none' }}
                    flexWrap="wrap"
                  >
                    <WarningTwoIcon color="status.limited" boxSize={3.5} aria-hidden />
                    <Text fontSize="sm" flex="1 1 240px" minW={0}>
                      {a.text}
                    </Text>
                    {a.action}
                  </Flex>
                ))}
              </Box>
            </Box>
          ) : null}

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
                <Box as="span" color="accent.text" mr={2}>
                  [{String(gi + 1).padStart(2, '0')}]
                </Box>
                {g.label}
              </Text>
              <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
                {g.cards.map((c) => {
                  const detail = overview ? cardDetail(c.key, overview, now) : null
                  return (
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
                      _focusWithin={{ borderColor: 'accent.500', boxShadow: '0 0 0 1px var(--accent)' }}
                      sx={{
                        '@media (prefers-reduced-motion: reduce)': {
                          transition: 'border-color 180ms',
                          '&:hover': { transform: 'none' },
                        },
                      }}
                    >
                      <Flex align="center" justify="space-between" mb={4}>
                        <Flex w="36px" h="36px" borderRadius="lg" bg="var(--accent-soft)" color="accent.text" align="center" justify="center">
                          <Icon as={c.icon} boxSize={4} aria-hidden />
                        </Flex>
                        <ArrowForwardIcon
                          aria-hidden
                          color="page.muted"
                          transition="transform 180ms var(--ease-out-quart), color 180ms"
                          _groupHover={{ transform: 'translateX(3px)', color: 'accent.text' }}
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
                      {state === 'loading' && ['inbox', 'blog', 'work', 'now', 'uses', 'about', 'storage', 'cv', 'home', 'security', 'system'].includes(c.key) ? (
                        <Skeleton h="12px" w="55%" mt={3} />
                      ) : detail ? (
                        <Text mt={3} fontFamily={MONO} fontSize="11px" color="page.fg-secondary" className="tnum">
                          {detail}
                        </Text>
                      ) : null}
                    </LinkBox>
                  )
                })}
              </SimpleGrid>
            </Box>
          ))}
        </Box>
      </HeaderFooter>
    </>
  )
}
