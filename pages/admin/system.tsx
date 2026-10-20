import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { Box, Flex, Spinner } from '@chakra-ui/react'
import { AdminPageShell } from '../../components/Admin/shell/ui'
import SegmentedTabs, {
  tabPanelProps,
  type SegmentedItem,
} from '../../components/Admin/shell/SegmentedTabs'
import HealthPanel from '../../components/Admin/system/HealthPanel'
import ErrorsPanel from '../../components/Admin/system/ErrorsPanel'

const panelLoading = (label: string) =>
  function PanelLoading() {
    return (
      <Flex h="30vh" align="center" justify="center" role="status" aria-label={label}>
        <Spinner color="accent.500" />
      </Flex>
    )
  }

// Loaded when their view opens.
const ActivityPanel = dynamic(() => import('../../components/Admin/system/ActivityPanel'), {
  ssr: false,
  loading: panelLoading('Loading activity'),
})
const ContentHealthPanel = dynamic(() => import('../../components/Admin/system/ContentHealthPanel'), {
  ssr: false,
  loading: panelLoading('Loading content health'),
})

const SYSTEM_VIEWS = ['health', 'content', 'errors', 'activity'] as const
type View = (typeof SYSTEM_VIEWS)[number]
const VIEWS: SegmentedItem<View>[] = [
  { key: 'health', label: 'Health' },
  { key: 'content', label: 'Content' },
  { key: 'errors', label: 'Errors' },
  { key: 'activity', label: 'Activity' },
]

const isView = (v: unknown): v is View => typeof v === 'string' && (SYSTEM_VIEWS as readonly string[]).includes(v)

/**
 * Admin → System: server health (build, disk, databases, backups, restore
 * drills, recent warnings), the content health center (links, images,
 * structure of the published content), the first-party error monitor and
 * the activity log (who changed what, when).
 *   /admin/system                health
 *   /admin/system?view=content   content health
 *   /admin/system?view=errors    errors
 *   /admin/system?view=activity  activity log
 */
export default function AdminSystem() {
  const router = useRouter()
  const [view, setView] = useState<View>('health')

  useEffect(() => {
    if (!router.isReady) return
    setView(isView(router.query.view) ? router.query.view : 'health')
  }, [router.isReady, router.query.view])

  const go = useCallback(
    (next: View) => {
      setView(next)
      const query = { ...router.query }
      if (next !== 'health') query.view = next
      else delete query.view
      void router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      })
    },
    [router]
  )

  return (
    <AdminPageShell
      headTitle="Admin · System"
      eyebrow="[admin]"
      title="System"
      actions={
        <SegmentedTabs
          items={VIEWS}
          value={view}
          onSelect={go}
          label="System sections"
          idPrefix="system"
          size="sm"
        />
      }
    >
      <Box {...tabPanelProps('system', view)}>
        {view === 'errors' ? (
          <ErrorsPanel />
        ) : view === 'activity' ? (
          <ActivityPanel />
        ) : view === 'content' ? (
          <ContentHealthPanel />
        ) : (
          <HealthPanel onShowErrors={() => go('errors')} onShowContent={() => go('content')} />
        )}
      </Box>
    </AdminPageShell>
  )
}
