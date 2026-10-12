import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Skeleton,
  Stack,
  useToast,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { AdminDirtyProvider, useDirtyRegistration } from './AdminDirtyContext'
import {
  AdminPageShell,
  BackLink,
  LoadErrorNotice,
  RevalidatedPaths,
  SaveButton,
  SaveStatus,
  SessionExpiredNotice,
  inputProps,
  useSaveShortcut,
  type SaveState,
} from './shell/ui'
import { loginHref, parseRevalidated, readJsonObject, saveToastCopy } from './shell/http'

// TipTap touches the DOM during init — client-side only.
const RichEditor = dynamic(() => import('./RichEditor'), {
  ssr: false,
  loading: () => <Skeleton h="520px" borderRadius="lg" />,
})

type PageName = 'now' | 'uses'

type Frontmatter = {
  title: string
  description: string
  updated: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

/** gray-matter parses YAML dates into Date objects; normalise to YYYY-MM-DD. */
function toIsoDay(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10)
  if (typeof raw === 'string' && raw) return raw.slice(0, 10)
  return todayISO()
}

/**
 * Single-file MDX editor used by /admin/now and /admin/uses. The two pages
 * share one shape (one document, no slug list), so this picks which to load.
 */
function PageEditorInner({ name }: { name: PageName }) {
  const router = useRouter()
  const toast = useToast()

  const [fm, setFm] = useState<Frontmatter>({ title: '', description: '', updated: todayISO() })
  const [body, setBody] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [revalidated, setRevalidated] = useState<string[]>([])
  const [baseline, setBaseline] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoadState('loading')
    setBaseline(null)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/page?name=${name}`, { cache: 'no-store' })
        if (res.status === 401) {
          router.replace(loginHref(`/admin/${name}`))
          return
        }
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        if (!alive) return
        const f = (data.frontmatter as Record<string, unknown>) || {}
        setFm({
          title: String(f.title ?? name.charAt(0).toUpperCase() + name.slice(1)),
          description: String(f.description ?? ''),
          updated: toIsoDay(f.updated),
        })
        setBody(typeof data.body === 'string' ? data.body : '')
        setLoadState('ready')
      } catch (e: any) {
        if (!alive) return
        setLoadError(
          e?.message === 'Failed to fetch' ? 'network error' : e?.message || 'unknown error'
        )
        setLoadState('error')
      }
    })()
    return () => {
      alive = false
    }
    // router is stable for this purpose; reload only when the page or retry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, reloadKey])

  const snapshot = useMemo(() => JSON.stringify({ fm, body }), [fm, body])
  useEffect(() => {
    if (loadState === 'ready' && baseline === null) setBaseline(snapshot)
  }, [loadState, baseline, snapshot])
  const dirty = loadState === 'ready' && baseline !== null && snapshot !== baseline
  useDirtyRegistration(`page:${name}`, dirty)

  const save = useCallback(async () => {
    if (loadState !== 'ready' || saving) return
    if (!fm.title.trim()) {
      toast({ status: 'error', title: 'Title is required', position: 'bottom-right' })
      return
    }
    const savedSnapshot = snapshot
    setSaving(true)
    let res: Response | null = null
    try {
      res = await fetch('/api/admin/page', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          frontmatter: {
            title: fm.title,
            description: fm.description || undefined,
            updated: fm.updated,
          },
          body,
        }),
      })
    } catch {
      res = null
    }
    setSaving(false)
    if (!res) {
      toast({ status: 'error', title: 'Network error — not saved', position: 'bottom-right' })
      return
    }
    const data = await readJsonObject(res)
    if (!res.ok) {
      if (res.status === 401) setSessionExpired(true)
      toast({
        status: 'error',
        title: 'Save failed',
        description:
          res.status === 401
            ? 'Your session has expired. Sign in again in a new tab, then save — your edits are kept.'
            : res.status === 429
              ? 'Too many saves in a short time — wait a minute and try again.'
              : data.error || `HTTP ${res.status}`,
        position: 'bottom-right',
        duration: 7000,
        isClosable: true,
      })
      return
    }
    const paths = parseRevalidated(data)
    setSessionExpired(false)
    setRevalidated(paths)
    setBaseline(savedSnapshot)
    toast({ ...saveToastCopy(data), title: 'Saved — snapshot taken', position: 'bottom-right' })
  }, [loadState, saving, fm, body, name, snapshot, toast])

  const canSave = loadState === 'ready' && dirty && !saving
  useSaveShortcut(canSave, save)
  const saveState: SaveState =
    loadState === 'loading'
      ? 'loading'
      : loadState === 'error'
        ? 'error'
        : saving
          ? 'saving'
          : dirty
            ? 'dirty'
            : 'clean'

  return (
    <AdminPageShell
      headTitle={`Admin · /${name}`}
      eyebrow={`[admin] page · ${name}`}
      title={`Edit /${name}`}
      status={<SaveStatus state={saveState} />}
      actions={
        <>
          <BackLink href="/admin">← Admin</BackLink>
          <Button
            as="a"
            href={`/${name}`}
            target="_blank"
            rel="noopener"
            size="sm"
            variant="ghost"
            color="page.fg-secondary"
          >
            View live ↗
          </Button>
          <SaveButton onSave={save} canSave={canSave} saving={saving} />
        </>
      }
    >
      <Stack spacing={4}>
        {loadState === 'error' ? (
          <LoadErrorNotice
            what={`/${name}`}
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        ) : null}
        {sessionExpired ? <SessionExpiredNotice returnPath={`/admin/${name}`} keepEdits /> : null}
        {revalidated.length ? <RevalidatedPaths paths={revalidated} /> : null}

        {loadState === 'loading' ? (
          <Stack spacing={4} aria-busy="true" aria-label={`Loading /${name}`}>
            <Skeleton h="40px" />
            <Skeleton h="40px" />
            <Skeleton h="420px" />
          </Stack>
        ) : loadState === 'error' ? null : (
          <Stack spacing={4}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl isRequired>
                <FormLabel fontSize="13px">Title</FormLabel>
                <Input
                  {...inputProps}
                  value={fm.title}
                  onChange={(e) => setFm({ ...fm, title: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="13px">Updated</FormLabel>
                <Input
                  {...inputProps}
                  type="date"
                  value={fm.updated}
                  onChange={(e) => setFm({ ...fm, updated: e.target.value })}
                />
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel fontSize="13px">Description</FormLabel>
              <Input
                {...inputProps}
                value={fm.description}
                onChange={(e) => setFm({ ...fm, description: e.target.value })}
                placeholder="One-line summary for link previews and the meta description"
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="13px" id={`${name}-body-label`}>
                Body
              </FormLabel>
              <RichEditor
                value={body}
                onChange={setBody}
                minH="520px"
                labelledBy={`${name}-body-label`}
                placeholder="Write in Markdown. Drag, drop or paste images. Use the MDX tab for JSX components."
              />
            </FormControl>
          </Stack>
        )}
      </Stack>
    </AdminPageShell>
  )
}

export default function PageEditor({ name }: { name: PageName }) {
  return (
    <AdminDirtyProvider>
      <PageEditorInner name={name} />
    </AdminDirtyProvider>
  )
}
