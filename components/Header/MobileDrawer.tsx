import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Grid,
  IconButton,
  Link,
  Text,
  chakra,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { useRouter } from 'next/router'
import { MOBILE_MENU_ID, PRIMARY_LINKS, type NavLink, type SocialLink, type SocialName, isActiveRoute } from '../Chrome/chrome'
import { useChromeLang } from '../Chrome/chromeLang'
import { cvPdfPath } from '../../lib/cvExport/paths'
import { GitHubIcon, GitLabIcon, LinkedInIcon, WhatsAppIcon } from '../Icons/brand'
import ThemeSwitch from './ThemeSwitch'
import {
  LINK_ENTER_MS,
  LINK_RISE_PX,
  LINK_STAGGER_MS,
  SHEET_EASE_CSS,
  SNAP_BACK_MS,
  classifyMove,
  closeDurationMs,
  dragOffset,
  prefersReducedMotion,
  pushSample,
  releaseVelocity,
  scrimProgress,
  scrimVariants,
  sheetVariants,
  shouldCloseOnRelease,
  shouldStaggerLinks,
  type DragSample,
} from './drawerGesture'

/**
 * Mobile menu (below lg), loaded on demand by the header.
 *
 *   Menu                                   ×
 *   NAVIGATE
 *   01  Home                 large type, the current page marked
 *   …
 *   [⌕ Search] [↓ CV as PDF] [文 中文简历]   quick actions
 *   ELSEWHERE  (profile icons)
 *   THEME  [☀ Light | ☾ Dark]               icon and label agree
 *   ADMIN (signed in only)
 *
 * A physical sheet (components/Header/drawerGesture.ts): it follows a
 * horizontal drag, closes when released past 35 % of its width or flicked
 * right faster than 500 px/s, otherwise settles back; the scrim lightens as
 * it leaves. The drag moves an inner wrapper, not Chakra's Slide (which
 * animates its own transform), and the dialog element keeps its classes, so
 * the route-transition layer lifting (lib/viewTransition
 * liftDismissibleLayers) still captures the panel and the scrim. A drag
 * never activates the link it started on, and vertical scrolling inside the
 * menu still works (the wrapper only claims horizontal pans).
 *
 * Chakra's Drawer keeps doing the dialog work: focus trap, Escape, scroll
 * lock, focus on the first link when it opens, focus back to the hamburger
 * when it closes. Under prefers-reduced-motion it opens and closes at once,
 * a release settles without animating and the links do not stagger in.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const SOCIAL_ICONS: Record<SocialName, React.ReactElement> = {
  GitHub: <GitHubIcon />,
  GitLab: <GitLabIcon />,
  LinkedIn: <LinkedInIcon />,
  WhatsApp: <WhatsAppIcon />,
}

/** When the menu last closed (module scope: survives the dialog unmounting). */
let lastClosedAt: number | null = null

/** Mono uppercase group label. */
function DrawerLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Text id={id} fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-subtle" mb={2}>
      {children}
    </Text>
  )
}

const SearchGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </g>
  </svg>
)

const DownloadGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
    </g>
  </svg>
)

const ZhGlyph = () => (
  <Box as="span" aria-hidden fontSize="16px" lineHeight="18px" fontWeight={600} lang="zh-Hans">
    文
  </Box>
)

/** Shared look of the quick-action tiles. */
const TILE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 2,
  w: '100%',
  h: '100%',
  minH: '64px',
  p: 3,
  border: '1px solid',
  borderColor: 'page.border',
  borderRadius: '12px',
  bg: 'page.bg-elevated',
  color: 'page.fg-secondary',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: 1.25,
  textAlign: 'left',
  transition: 'border-color 150ms, color 150ms',
  _hover: { color: 'page.fg', borderColor: 'page.border-strong', textDecoration: 'none' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
} as const

/**
 * The primary links. Mounted with the open menu, so each opening can run
 * the entrance: the items start 6px low and transparent and rise in, 24 ms
 * apart (plain CSS transitions, kicked off after the first painted frame).
 */
function NavLinks({
  pathname,
  stagger,
  onNavigate,
  firstLinkRef,
  links,
}: {
  pathname: string
  links: readonly NavLink[]
  stagger: boolean
  onNavigate: () => void
  firstLinkRef: React.RefObject<HTMLAnchorElement>
}) {
  const [entered, setEntered] = useState(!stagger)
  useEffect(() => {
    if (entered) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [entered])

  return (
    <Box as="ul" listStyleType="none" m={0} p={0}>
      {links.map((link, i) => {
        const active = isActiveRoute(pathname, link.url)
        return (
          <li
            key={link.name}
            style={
              stagger
                ? {
                    opacity: entered ? 1 : 0,
                    transform: entered ? 'none' : `translateY(${LINK_RISE_PX}px)`,
                    transition: `opacity ${LINK_ENTER_MS}ms ${SHEET_EASE_CSS}, transform ${LINK_ENTER_MS}ms ${SHEET_EASE_CSS}`,
                    transitionDelay: `${i * LINK_STAGGER_MS}ms`,
                  }
                : undefined
            }
          >
            <Link
              as={NextLink}
              href={link.url}
              ref={i === 0 ? firstLinkRef : undefined}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              display="flex"
              alignItems="baseline"
              gap={4}
              minH="46px"
              py={1}
              fontSize="26px"
              lineHeight="38px"
              letterSpacing="-0.02em"
              fontWeight={500}
              color={active ? 'page.fg' : 'page.fg-secondary'}
              borderRadius="8px"
              _hover={{ color: 'page.fg', textDecoration: 'none' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            >
              <Text
                as="span"
                aria-hidden
                fontFamily={MONO}
                fontSize="11px"
                letterSpacing="0.04em"
                lineHeight="38px"
                className="tnum"
                color={active ? 'accent.text' : 'page.fg-subtle'}
                minW="2ch"
              >
                {String(i + 1).padStart(2, '0')}
              </Text>
              <span>{link.name}</span>
              {active && (
                <Box
                  as="span"
                  aria-hidden
                  alignSelf="center"
                  w="6px"
                  h="6px"
                  borderRadius="full"
                  bg="var(--accent)"
                  sx={{ '@media (forced-colors: active)': { bg: 'CanvasText' } }}
                />
              )}
            </Link>
          </li>
        )
      })}
    </Box>
  )
}

type Gesture = {
  pointerId: number
  x0: number
  y0: number
  dx: number
  width: number
  dragging: boolean
  samples: DragSample[]
}

export type MobileDrawerProps = {
  isOpen: boolean
  onClose: () => void
  socials: readonly SocialLink[]
  /** The primary navigation (chrome navLinksFor); defaults to PRIMARY_LINKS. */
  navLinks?: readonly NavLink[]
  isAdmin: boolean
  onLogout: () => void
  /** Quick action: close the menu and open the ⌘K palette. */
  onSearch?: () => void
  /** Called once the close animation has finished. */
  onCloseComplete?: () => void
  /** False when the menu closes because the visitor left the page (focus then moves to the new page). */
  returnFocusOnClose?: boolean
}

export default function MobileDrawer({
  isOpen,
  onClose,
  socials,
  navLinks = PRIMARY_LINKS,
  isAdmin,
  onLogout,
  onSearch,
  onCloseComplete,
  returnFocusOnClose = true,
}: MobileDrawerProps) {
  const router = useRouter()
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  // Portaled to <body>, outside the header's lang="en" subtree.
  const chromeLang = useChromeLang()
  const reduceMotion = prefersReducedMotion(typeof window === 'undefined' ? undefined : window)

  // Decided as the menu opens, in the render that mounts its content: the
  // links stagger in unless the menu was closed a moment ago.
  const wasOpen = useRef(false)
  const stagger = useRef(false)
  if (isOpen && !wasOpen.current) stagger.current = shouldStaggerLinks(lastClosedAt, Date.now(), reduceMotion)
  else if (!isOpen && wasOpen.current) lastClosedAt = Date.now()
  wasOpen.current = isOpen

  // ── drag to close ────────────────────────────────────────────────────────
  // The panel and the scrim tint are styled directly while a finger moves
  // (no React render per frame); a fresh panel mounts with each opening.
  const panelRef = useRef<HTMLDivElement>(null)
  const tintRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const dragged = useRef(false)

  const place = useCallback((x: number, width: number, ms: number) => {
    const panel = panelRef.current
    const tint = tintRef.current
    const transition = (prop: string) => (ms > 0 ? `${prop} ${ms}ms ${SHEET_EASE_CSS}` : 'none')
    if (panel) {
      panel.style.transition = transition('transform')
      panel.style.transform = x ? `translate3d(${x}px, 0, 0)` : ''
    }
    if (tint) {
      tint.style.transition = transition('opacity')
      tint.style.opacity = String(scrimProgress(x, width))
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragged.current = false
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    gesture.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      width: panelRef.current?.offsetWidth || 0,
      dragging: false,
      samples: [{ t: e.timeStamp, x: 0 }],
    }
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      const dx = e.clientX - g.x0
      if (!g.dragging) {
        const kind = classifyMove(dx, e.clientY - g.y0)
        if (kind === null) return
        if (kind === 'scroll') {
          gesture.current = null
          return
        }
        g.dragging = true
        dragged.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        e.currentTarget.style.userSelect = 'none'
      }
      g.dx = dx
      const x = dragOffset(dx)
      g.samples = pushSample(g.samples, { t: e.timeStamp, x })
      place(x, g.width, 0)
    },
    [place],
  )

  const endGesture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      gesture.current = null
      if (!g.dragging) return
      e.currentTarget.style.userSelect = ''
      const x = dragOffset(g.dx)
      const velocity = cancelled ? 0 : releaseVelocity(g.samples, e.timeStamp)
      if (!cancelled && shouldCloseOnRelease(x, velocity, g.width)) {
        // The panel keeps moving with the flick while the dialog exits.
        place(g.width, g.width, reduceMotion ? 0 : closeDurationMs(g.width - x, velocity))
        onClose()
      } else {
        place(0, g.width, reduceMotion ? 0 : SNAP_BACK_MS)
      }
    },
    [onClose, place, reduceMotion],
  )

  // A drag that started on a link must not follow it when released.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!dragged.current) return
    dragged.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return (
    <Drawer id={MOBILE_MENU_ID}
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      onCloseComplete={onCloseComplete}
      initialFocusRef={firstLinkRef}
      returnFocusOnClose={returnFocusOnClose}
    >
      <DrawerOverlay
        bg="transparent"
        backdropFilter="blur(4px)"
        motionProps={{ initial: 'exit', animate: 'enter', exit: 'exit', variants: scrimVariants(reduceMotion) }}
      >
        {/* The tint follows the drag; the blur stays until the menu has gone. */}
        <Box ref={tintRef} aria-hidden position="absolute" inset={0} bg="rgba(0,0,0,0.6)" />
      </DrawerOverlay>
      <DrawerContent lang={chromeLang}
        bg="transparent"
        boxShadow="none"
        maxW="min(23rem, calc(100vw - 3rem))"
        motionProps={{ variants: sheetVariants(reduceMotion) }}
      >
        <Flex
          ref={panelRef}
          data-drawer-panel=""
          direction="column"
          position="relative"
          h="100%"
          minH={0}
          bg="page.bg"
          color="page.fg"
          borderLeft="1px solid"
          borderColor="page.border"
          boxShadow="-24px 0 48px -24px rgba(0,0,0,0.35)"
          // Horizontal pans are the sheet's; vertical ones still scroll the menu.
          sx={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endGesture(e, false)}
          onPointerCancel={(e) => endGesture(e, true)}
          onClickCapture={onClickCapture}
          // Links must not start a native drag-and-drop under a mouse drag.
          onDragStart={(e) => e.preventDefault()}
        >
          {/* Grab handle: a drag affordance on touch screens only. */}
          <Box
            aria-hidden
            position="absolute"
            left="5px"
            top="50%"
            w="4px"
            h="40px"
            mt="-20px"
            borderRadius="full"
            bg="page.border-strong"
            display="none"
            sx={{ '@media (pointer: coarse)': { display: 'block' } }}
          />
          <DrawerCloseButton top="10px" color="page.fg-subtle" _hover={{ color: 'page.fg', bg: 'page.hover' }} />
          <DrawerHeader
            borderBottomWidth="1px"
            borderColor="page.border"
            fontFamily={MONO}
            fontSize="11px"
            fontWeight={500}
            letterSpacing="0.12em"
            textTransform="uppercase"
            color="page.fg-subtle"
            py={4}
          >
            Menu
          </DrawerHeader>
          {/* The body is the scroll container, where touch-action is decided: it must also leave horizontal pans to the sheet. */}
          <DrawerBody py={5} px={6} minH={0} overscrollBehavior="contain" sx={{ touchAction: 'pan-y' }}>
            <Flex direction="column" gap={6}>
              <Box as="nav" aria-labelledby="drawer-nav-label">
                <DrawerLabel id="drawer-nav-label">Navigate</DrawerLabel>
                <NavLinks pathname={router.pathname} links={navLinks} stagger={stagger.current} onNavigate={onClose} firstLinkRef={firstLinkRef} />
              </Box>

              <Grid as="ul" listStyleType="none" m={0} p={0} templateColumns="repeat(3, minmax(0, 1fr))" gap={2} aria-label="Quick actions">
                <li>
                  <chakra.button type="button" sx={TILE} onClick={onSearch} aria-haspopup="dialog">
                    <SearchGlyph />
                    Search
                  </chakra.button>
                </li>
                <li>
                  <Link href={cvPdfPath(chromeLang ? 'zh' : 'en')} download type="application/pdf" sx={TILE} onClick={onClose}>
                    <DownloadGlyph />
                    CV as PDF
                  </Link>
                </li>
                <li>
                  <Link as={NextLink} href="/cv/zh" sx={TILE} onClick={onClose}>
                    <ZhGlyph />
                    <span lang="zh-Hans">中文简历</span>
                  </Link>
                </li>
              </Grid>

              {socials.length > 0 && (
                <Box>
                  <DrawerLabel>Elsewhere</DrawerLabel>
                  <Flex gap={2} wrap="wrap">
                    {socials.map((s) => (
                      <IconButton
                        key={s.name}
                        as="a"
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        icon={SOCIAL_ICONS[s.name]}
                        variant="outline"
                        size="md"
                        minW="44px"
                        h="44px"
                        borderColor="page.border"
                        color="page.fg-subtle"
                        _hover={{ color: 'page.fg', borderColor: 'page.border-strong' }}
                        aria-label={`${s.name} (opens in a new tab)`}
                        title={s.name}
                      />
                    ))}
                  </Flex>
                </Box>
              )}

              <Box>
                <DrawerLabel>Theme</DrawerLabel>
                <ThemeSwitch />
              </Box>

              {/* Admin section — like the desktop header, only when signed in. */}
              {isAdmin && (
                <Box>
                  <DrawerLabel>Admin</DrawerLabel>
                  <Flex direction="column" gap={2}>
                    <Button
                      as={NextLink}
                      href="/admin/dashboard"
                      h="44px"
                      variant="outline"
                      borderColor="page.border"
                      color="page.fg-secondary"
                      _hover={{ borderColor: 'page.border-strong', color: 'page.fg' }}
                      onClick={onClose}
                    >
                      Dashboard
                    </Button>
                    <Button
                      h="44px"
                      variant="ghost"
                      color="page.fg-subtle"
                      _hover={{ color: 'page.fg', bg: 'page.hover' }}
                      onClick={() => {
                        onClose()
                        onLogout()
                      }}
                    >
                      Logout
                    </Button>
                  </Flex>
                </Box>
              )}
            </Flex>
          </DrawerBody>
        </Flex>
      </DrawerContent>
    </Drawer>
  )
}
