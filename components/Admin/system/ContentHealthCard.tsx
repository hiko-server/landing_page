import { useCallback, useEffect, useState } from 'react'
import { Box, Button, Flex, Skeleton, Text } from '@chakra-ui/react'
import { CheckCircleIcon, InfoOutlineIcon, WarningTwoIcon } from '@chakra-ui/icons'
import { Panel, outlineButtonProps } from '../shell/ui'
import { readJsonObject } from '../shell/http'
import { NETWORK_ERROR } from '../shell/authMessages'
import { relativeTime } from '../security/securityFormat'
import {
  SEVERITIES,
  SEVERITY_LABEL,
  type HealthSummary,
  type Severity,
} from '../../../lib/contentHealth/types'
import { linkStatusLine } from './contentHealthFormat'

/**
 * Admin → System → Health: the content health summary (GET
 * /api/admin/content-health?summary=1) — issues by severity and the link
 * checker's last run — with a way into the Content view.
 */

const ICON: Record<Severity, typeof WarningTwoIcon> = {
  error: WarningTwoIcon,
  warning: WarningTwoIcon,
  notice: InfoOutlineIcon,
}
const COLOR: Record<Severity, string> = {
  error: 'status.error',
  warning: 'status.warning',
  notice: 'page.fg-secondary',
}

export default function ContentHealthCard({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<HealthSummary | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/content-health?summary=1', { cache: 'no-store' })
      const json = await readJsonObject(res)
      if (!res.ok)
        throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`)
      setData(json as unknown as HealthSummary)
      setError('')
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'Failed to fetch' ? err.message : NETWORK_ERROR
      )
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const total = data ? data.counts.error + data.counts.warning + data.counts.notice : 0
  const now = data?.generatedAt ?? 0

  return (
    <Panel
      as="section"
      aria-labelledby="system-content-health"
      gridColumn={{ md: 'span 2' }}
      data-testid="content-health-card"
    >
      <Flex justify="space-between" align="baseline" gap={2} flexWrap="wrap" mb={3}>
        <Text as="h3" id="system-content-health" fontSize="sm" fontWeight={600}>
          Content health
        </Text>
        <Button size="xs" {...outlineButtonProps} onClick={onOpen} minH="28px">
          Open content health
        </Button>
      </Flex>
      {error && !data ? (
        <Flex align="center" gap={3} flexWrap="wrap">
          <Text fontSize="sm" color="page.fg-secondary">
            Couldn’t load the summary ({error}).
          </Text>
          <Button size="xs" variant="link" color="accent.text" onClick={() => void load()}>
            Retry
          </Button>
        </Flex>
      ) : !data ? (
        <Box aria-busy="true" aria-label="Loading the content health summary">
          <Skeleton h="22px" w="60%" borderRadius="control" />
          <Skeleton h="16px" w="40%" mt={2} borderRadius="control" />
        </Box>
      ) : (
        <>
          {total ? (
            <Flex as="ul" listStyleType="none" gap={{ base: 3, sm: 5 }} flexWrap="wrap">
              {SEVERITIES.map((s) => {
                const Icon = ICON[s]
                const n = data.counts[s]
                return (
                  <Flex as="li" key={s} align="center" gap={1.5}>
                    <Icon color={n ? COLOR[s] : 'page.muted'} boxSize={3} aria-hidden />
                    <Text fontSize="sm" className="tnum">
                      <Text as="span" fontWeight={600}>
                        {n}
                      </Text>{' '}
                      {n === 1
                        ? SEVERITY_LABEL[s].one.toLowerCase()
                        : SEVERITY_LABEL[s].many.toLowerCase()}
                    </Text>
                  </Flex>
                )
              })}
              {data.counts.fixable ? (
                <Text as="li" fontSize="sm" color="accent.text">
                  {data.counts.fixable} with a one-click fix
                </Text>
              ) : null}
            </Flex>
          ) : (
            <Flex align="center" gap={2}>
              <CheckCircleIcon color="status.open" boxSize={3.5} aria-hidden />
              <Text fontSize="sm">No problems in {data.scanned.items} published items.</Text>
            </Flex>
          )}
          <Text fontSize="xs" color="page.fg-secondary" mt={2} className="tnum">
            Links: {data.links.total ? `${data.links.total} external` : 'none external'}
            {data.links.broken ? ` · ${data.links.broken} broken` : ''} ·{' '}
            {linkStatusLine(data.links, (ms) => relativeTime(ms, now))}
          </Text>
        </>
      )}
    </Panel>
  )
}
