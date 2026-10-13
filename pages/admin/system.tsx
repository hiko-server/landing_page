import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Box } from '@chakra-ui/react'
import { AdminPageShell } from '../../components/Admin/shell/ui'
import SegmentedTabs, { tabPanelProps, type SegmentedItem } from '../../components/Admin/shell/SegmentedTabs'
import HealthPanel from '../../components/Admin/system/HealthPanel'
import ErrorsPanel from '../../components/Admin/system/ErrorsPanel'

type View = 'health' | 'errors'
const VIEWS: SegmentedItem<View>[] = [
  { key: 'health', label: 'Health' },
  { key: 'errors', label: 'Errors' },
]

/**
 * Admin → System: server health (build, disk, databases, backups, restore
 * drills, recent warnings) and the first-party error monitor.
 *   /admin/system            health
 *   /admin/system?view=errors errors
 */
export default function AdminSystem() {
  const router = useRouter()
  const [view, setView] = useState<View>('health')

  useEffect(() => {
    if (!router.isReady) return
    setView(router.query.view === 'errors' ? 'errors' : 'health')
  }, [router.isReady, router.query.view])

  const go = useCallback(
    (next: View) => {
      setView(next)
      const query = { ...router.query }
      if (next === 'errors') query.view = 'errors'
      else delete query.view
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    },
    [router],
  )

  return (
    <AdminPageShell
      headTitle="Admin · System"
      eyebrow="[admin]"
      title="System"
      actions={<SegmentedTabs items={VIEWS} value={view} onSelect={go} label="System sections" idPrefix="system" size="sm" />}
    >
      <Box {...tabPanelProps('system', view)}>{view === 'errors' ? <ErrorsPanel /> : <HealthPanel onShowErrors={() => go('errors')} />}</Box>
    </AdminPageShell>
  )
}
