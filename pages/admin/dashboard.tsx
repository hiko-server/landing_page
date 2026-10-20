import { useCallback, useEffect, useRef, useState } from 'react'
import NextLink from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import {
  Box,
  Button,
  Flex,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  useToast,
} from '@chakra-ui/react'
import { ChevronDownIcon } from '@chakra-ui/icons'
import { FaHome, FaFileAlt, FaHistory, FaDatabase, FaInbox, FaChartLine } from 'react-icons/fa'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import CVEditor from '../../components/Admin/CVEditor'
import CVEditorStudio from '../../components/Admin/CVEditorStudio'
import HomeEditor from '../../components/Admin/HomeEditor'
import VersionHistory from '../../components/Admin/VersionHistory'
import StoragePanel from '../../components/Admin/StoragePanel'
import InboxPanel from '../../components/Admin/InboxPanel'
import ErrorBoundary from '../../components/Common/ErrorBoundary'
import { PanelFallback } from '../../components/Common/PanelFallback'
import { AdminDirtyProvider, useAdminDirty } from '../../components/Admin/AdminDirtyContext'
import { AdminTitleBar, MONO, SITE_HEADER_H, useIsMac } from '../../components/Admin/shell/ui'
import SegmentedTabs, {
  tabPanelProps,
  type SegmentedItem,
} from '../../components/Admin/shell/SegmentedTabs'
import {
  tabShortcutFor,
  tabShortcutIndex,
  tabShortcutLabel,
} from '../../components/Admin/shell/shortcuts'
import { readJsonObject } from '../../components/Admin/shell/http'
import { useAdminCommands } from '../../components/Admin/shell/useAdminCommands'
import {
  DASHBOARD_TABS,
  dashboardQuery,
  parseDashboardQuery,
  type CvView,
  type DashboardTab,
} from '../../components/Admin/shell/dashboardTabs'

// Loaded only when the tab opens: the charts and tables never weigh on the editors.
const AnalyticsPanel = dynamic(() => import('../../components/Admin/AnalyticsPanel'), {
  ssr: false,
  loading: () => (
    <Flex h="40vh" align="center" justify="center" role="status" aria-label="Loading analytics">
      <Spinner color="accent.500" />
    </Flex>
  ),
})

const TAB_META: Record<DashboardTab, { label: string; icon: SegmentedItem<DashboardTab>['icon'] }> =
  {
    home: { label: 'Home', icon: FaHome },
    cv: { label: 'CV', icon: FaFileAlt },
    versions: { label: 'Versions', icon: FaHistory },
    storage: { label: 'Storage', icon: FaDatabase },
    inbox: { label: 'Inbox', icon: FaInbox },
    analytics: { label: 'Analytics', icon: FaChartLine },
  }

const CV_VIEW_ITEMS: SegmentedItem<CvView>[] = [
  { key: 'studio', label: 'Studio' },
  { key: 'raw', label: 'Raw JSON' },
]

/** Wide workspace: the CV Studio uses nearly the whole viewport. */
const WORKSPACE_MAX_W = 'min(100%, 1680px)'
/** Site header + slim title bar (one row from md up) + content padding. */
const WORKSPACE_H = `calc(100vh - ${SITE_HEADER_H} - 53px - 32px)`

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

function Dashboard() {
  const router = useRouter()
  const toast = useToast()
  const { confirmDiscard } = useAdminDirty()
  const isMac = useIsMac()
  const [tab, setTab] = useState<DashboardTab>('home')
  const [cvView, setCvView] = useState<CvView>('studio')
  // Latest unsaved Home edits, readable even after the editor crashed, so the
  // error fallback can offer "Copy unsaved changes".
  const homeUnsaved = useRef<(() => unknown) | null>(null)
  const setHomeUnsavedSource = useCallback((get: (() => unknown) | null) => {
    homeUnsaved.current = get
  }, [])
  const getHomeUnsaved = useCallback(() => (homeUnsaved.current ? homeUnsaved.current() : null), [])
  // Unread contact messages, shown on the Inbox tab from any tab.
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/inbox', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? readJsonObject(r) : null))
      .then((b) => {
        if (alive && b && typeof b.unread === 'number') setUnread(b.unread)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // URL → state (initial load, shared links, /admin cards).
  useEffect(() => {
    if (!router.isReady) return
    const q = parseDashboardQuery(router.query)
    setTab(q.tab)
    setCvView(q.view)
  }, [router.isReady, router.query])

  const go = useCallback(
    async (nextTab: DashboardTab, nextView: CvView = 'studio'): Promise<boolean> => {
      if (nextTab === tab && (nextTab !== 'cv' || nextView === cvView)) return false
      // The visible editor unmounts on switch — ask (save / discard / stay) first.
      if (!(await confirmDiscard())) return false
      setTab(nextTab)
      setCvView(nextView)
      router.replace(
        { pathname: router.pathname, query: dashboardQuery(router.query, nextTab, nextView) },
        undefined,
        {
          shallow: true,
          scroll: false,
        }
      )
      return true
    },
    [tab, cvView, confirmDiscard, router]
  )

  // Alt+1–6 (⌃1–6 on macOS): never ⌘/Ctrl+digit (browser tabs) or ⌘S/⌘Z (editors).
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return
      const idx = tabShortcutIndex(e, DASHBOARD_TABS.length, {
        isMac,
        inEditable: isEditable(e.target),
      })
      if (idx === null) return
      e.preventDefault()
      void goRef.current(DASHBOARD_TABS[idx]).then((moved) => {
        if (!moved) return
        requestAnimationFrame(() =>
          document.getElementById(`dash-tab-${DASHBOARD_TABS[idx]}`)?.focus()
        )
      })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isMac])

  const sendTestMail = async () => {
    try {
      const res = await fetch('/api/admin/test-mail', { method: 'POST' })
      const data = await readJsonObject(res)
      const alignment = (data.alignment || {}) as { notifications?: { message?: string } | null; replies?: { message?: string } | null }
      const warning = [alignment.notifications?.message, alignment.replies?.message].filter(Boolean).join(' ')
      if (res.ok && !data.skipped && warning)
        toast({ status: 'warning', title: 'Test email sent — but mail may not arrive', description: warning, position: 'bottom-right' })
      else if (res.ok && !data.skipped)
        toast({ status: 'success', title: 'Test email sent', position: 'bottom-right' })
      else if (data.skipped)
        toast({
          status: 'warning',
          title: 'SMTP not configured',
          description: 'Nothing was sent.',
          position: 'bottom-right',
        })
      else
        toast({
          status: 'error',
          title: 'Test email failed',
          description: data.error || `HTTP ${res.status}`,
          position: 'bottom-right',
        })
    } catch {
      toast({
        status: 'error',
        title: 'Test email failed',
        description: 'Network error.',
        position: 'bottom-right',
      })
    }
  }

  // ⌘K: the dashboard's own action (the tabs are in the palette already).
  useAdminCommands('dashboard', [{ id: 'test-mail', label: 'Send a test e-mail', hint: 'checks SMTP and DMARC alignment', keywords: 'smtp mail email test dmarc', run: sendTestMail }], 'v1')

  const tabItems: SegmentedItem<DashboardTab>[] = DASHBOARD_TABS.map((key, i) => ({
    key,
    ...TAB_META[key],
    ...(key === 'inbox' && unread > 0 ? { label: `Inbox (${unread})` } : {}),
    shortcut: tabShortcutFor(isMac, i),
    ariaShortcut: `${isMac ? 'Control' : 'Alt'}+${i + 1}`,
  }))

  return (
    <>
      <CustomHead title="Admin · Dashboard" noindex />
      <HeaderFooter>
        <AdminTitleBar
          eyebrow="[admin]"
          title="Dashboard"
          maxW={WORKSPACE_MAX_W}
          status={
            <Text
              display={{ base: 'none', lg: 'block' }}
              fontFamily={MONO}
              fontSize="label"
              color="page.fg-subtle"
              aria-hidden
            >
              {tabShortcutLabel(isMac, DASHBOARD_TABS.length)} switch tabs
            </Text>
          }
          actions={
            <Menu placement="bottom-end" isLazy>
              <MenuButton
                as={Button}
                size="sm"
                variant="ghost"
                rightIcon={<ChevronDownIcon />}
                color="page.fg-secondary"
                _hover={{ bg: 'page.bg-overlay', color: 'page.fg' }}
                _active={{ bg: 'page.bg-overlay' }}
              >
                More
              </MenuButton>
              <MenuList bg="page.bg-elevated" borderColor="page.border" fontSize="sm" zIndex={50}>
                <MenuItem
                  as={NextLink}
                  href="/admin"
                  bg="transparent"
                  _hover={{ bg: 'page.bg-overlay' }}
                  _focus={{ bg: 'page.bg-overlay' }}
                >
                  All admin tools
                </MenuItem>
                <MenuItem
                  as={NextLink}
                  href="/admin/db-config"
                  bg="transparent"
                  _hover={{ bg: 'page.bg-overlay' }}
                  _focus={{ bg: 'page.bg-overlay' }}
                >
                  MongoDB backup
                </MenuItem>
                <MenuDivider borderColor="page.border" />
                <MenuItem
                  onClick={sendTestMail}
                  bg="transparent"
                  _hover={{ bg: 'page.bg-overlay' }}
                  _focus={{ bg: 'page.bg-overlay' }}
                >
                  Send test email
                </MenuItem>
              </MenuList>
            </Menu>
          }
        >
          <Flex gap={2} align="center" flexWrap="wrap" minW={0}>
            <SegmentedTabs
              items={tabItems}
              value={tab}
              onSelect={(k) => void go(k)}
              label="Dashboard sections"
              idPrefix="dash"
            />
            {tab === 'cv' ? (
              <SegmentedTabs
                items={CV_VIEW_ITEMS}
                value={cvView}
                onSelect={(v) => void go('cv', v)}
                label="CV editor"
                idPrefix="cvview"
                size="sm"
              />
            ) : null}
          </Flex>
        </AdminTitleBar>

        <Box
          {...tabPanelProps('dash', tab)}
          maxW={WORKSPACE_MAX_W}
          mx="auto"
          w="100%"
          px={{ base: 4, md: 6, lg: 8 }}
          py={4}
          _focus={{ outline: 'none' }}
          sx={{ '--admin-workspace-h': WORKSPACE_H }}
        >
          {/*
            Only the visible editor is mounted: each one owns keyboard
            shortcuts and its own copy of the data, so a hidden one must not
            listen or later overwrite a newer save.
          */}
          <ErrorBoundary
            name={`admin/${tab}`}
            resetKeys={[tab, cvView]}
            getUnsaved={tab === 'home' ? getHomeUnsaved : undefined}
            fallback={(p) => <PanelFallback {...p} />}
          >
            {tab === 'home' ? <HomeEditor onUnsavedSource={setHomeUnsavedSource} /> : null}
            {tab === 'cv' ? (
              <Box {...tabPanelProps('cvview', cvView)}>
                {cvView === 'raw' ? <CVEditor /> : <CVEditorStudio />}
              </Box>
            ) : null}
            {tab === 'versions' ? (
              <Box maxW="var(--container-content)" mx="auto">
                <VersionHistory />
              </Box>
            ) : null}
            {tab === 'storage' ? (
              <Box maxW="var(--container-content)" mx="auto">
                <StoragePanel />
              </Box>
            ) : null}
            {tab === 'inbox' ? (
              <Box maxW="var(--container-content)" mx="auto">
                <InboxPanel onUnreadChange={setUnread} />
              </Box>
            ) : null}
            {tab === 'analytics' ? (
              <Box maxW="var(--container-content)" mx="auto">
                <AnalyticsPanel />
              </Box>
            ) : null}
          </ErrorBoundary>
        </Box>
      </HeaderFooter>
    </>
  )
}

export default function AdminDashboard() {
  return (
    <AdminDirtyProvider>
      <Dashboard />
    </AdminDirtyProvider>
  )
}
