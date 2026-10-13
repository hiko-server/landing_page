import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  ListItem,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  UnorderedList,
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
  outlineButtonProps,
  useSaveShortcut,
  type SaveState,
} from './shell/ui'
import { loginHref, parseRevalidated, readJsonObject, saveToastCopy } from './shell/http'
import { useLocalDraft } from './shell/useLocalDraft'
import { useLeaveSaver } from './shell/useLeaveSaver'
import LivePreview from './shell/LivePreview'
import ItemHistoryDrawer from './shell/ItemHistoryDrawer'
import { ConflictDialog, DraftBanner, MdxErrorBanner, type MdxProblem } from './editor/EditorNotices'
import type { RichEditorHandle } from './RichEditor'

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

type Derived = { sources: string[]; markdown: string }

type DraftValue = { fm: Frontmatter; body: string }

const todayISO = () => new Date().toISOString().slice(0, 10)

/** gray-matter parses YAML dates into Date objects; normalise to YYYY-MM-DD. */
function toIsoDay(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10)
  if (typeof raw === 'string' && raw) return raw.slice(0, 10)
  return todayISO()
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** What an owner-written body does to each page (pages/now.tsx, pages/uses.tsx). */
const AUTO_COPY: Record<PageName, { what: string; replaces: string }> = {
  now: {
    what: 'Visitors currently see an automatic /now built from',
    replaces: 'Saving any text replaces the automatic page; clear the body to go back to automatic.',
  },
  uses: {
    what: 'Visitors currently see an automatic /uses built from',
    replaces: 'Saving any text puts your write-up first on /uses (the stack list stays below it); clear the body to go back to automatic.',
  },
}

/**
 * Single-file MDX editor used by /admin/now and /admin/uses: version-checked
 * saves (If-Match → "Changed elsewhere"), local draft recovery, compile
 * errors that jump to the line, history with diff + restore, live preview,
 * and the automatic page — what visitors see while the body is empty — as
 * a guided starting point ("Start from this") or a way back ("Revert to
 * automatic").
 */
function PageEditorInner({ name }: { name: PageName }) {
  const router = useRouter()
  const toast = useToast()
  const richRef = useRef<RichEditorHandle>(null)

  const [fm, setFm] = useState<Frontmatter>({ title: '', description: '', updated: todayISO() })
  const [body, setBody] = useState('')
  const [serverBody, setServerBody] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [revalidated, setRevalidated] = useState<string[]>([])
  const [baseline, setBaseline] = useState<string | null>(null)
  const [etag, setEtag] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const conflictBody = useRef<string | undefined>(undefined)
  const [mdxError, setMdxError] = useState<MdxProblem | null>(null)
  const [derived, setDerived] = useState<Derived | null>(null)
  const [derivedError, setDerivedError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [revertOpen, setRevertOpen] = useState(false)
  const [headingIndex, setHeadingIndex] = useState(-1)
  const revertCancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    setLoadState('loading')
    setBaseline(null)
    setConflict(false)
    setMdxError(null)
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
        const text = typeof data.body === 'string' ? data.body : ''
        setBody(text)
        setServerBody(text)
        setEtag(res.headers.get('ETag'))
        setSavedAt(typeof data.updatedAt === 'number' && data.updatedAt > 0 ? data.updatedAt : undefined)
        setLoadState('ready')
      } catch (e: any) {
        if (!alive) return
        setLoadError(e?.message === 'Failed to fetch' ? 'network error' : e?.message || 'unknown error')
        setLoadState('error')
      }
    })()
    return () => {
      alive = false
    }
    // router is stable for this purpose; reload only when the page or retry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, reloadKey])

  // The automatic page, while the stored body is empty.
  const automatic = loadState === 'ready' && !serverBody.trim()
  useEffect(() => {
    if (!automatic) return
    let alive = true
    setDerivedError('')
    void (async () => {
      try {
        const res = await fetch(`/api/admin/page-derived?name=${name}`, { cache: 'no-store' })
        const data = await readJsonObject(res)
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        if (alive) setDerived({ sources: Array.isArray(data.sources) ? data.sources : [], markdown: typeof data.markdown === 'string' ? data.markdown : '' })
      } catch (e) {
        if (alive) setDerivedError(e instanceof Error ? (e.message === 'Failed to fetch' ? 'network error' : e.message) : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [automatic, name])

  const snapshot = useMemo(() => JSON.stringify({ fm, body }), [fm, body])
  useEffect(() => {
    if (loadState === 'ready' && baseline === null) setBaseline(snapshot)
  }, [loadState, baseline, snapshot])
  const dirty = loadState === 'ready' && baseline !== null && snapshot !== baseline
  const { track, leave } = useLeaveSaver(snapshot)

  const draftValue = useMemo<DraftValue>(() => ({ fm, body }), [fm, body])
  const {
    draft: localDraft,
    stale: localDraftStale,
    restore: takeDraft,
    discard: discardDraft,
    clear: clearDraft,
    flush: flushDraft,
  } = useLocalDraft<DraftValue>({
    key: `page:${name}`,
    value: draftValue,
    baseEtag: etag,
    dirty,
    enabled: loadState === 'ready' && baseline !== null,
    equals: sameJson,
  })

  const restoreDraft = () => {
    const v = takeDraft()
    if (!v) return
    setFm(v.fm)
    setBody(v.body)
  }

  /** Save; `bodyOverride` saves that body instead (Revert to automatic → ''). */
  const save = useCallback(
    async (opts: { force?: boolean; bodyOverride?: string } = {}): Promise<boolean> => {
      if (loadState !== 'ready' || savingRef.current) return false
      if (!fm.title.trim()) {
        toast({ status: 'error', title: 'Title is required', position: 'bottom-right' })
        return false
      }
      const text = opts.bodyOverride ?? body
      const savedSnapshot = JSON.stringify({ fm, body: text })
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (etag && !opts.force) headers['If-Match'] = etag
      savingRef.current = true
      setSaving(true)
      return track(
        savedSnapshot,
        (async (): Promise<boolean> => {
          let res: Response | null = null
          try {
            res = await fetch('/api/admin/page', {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                name,
                frontmatter: { title: fm.title, description: fm.description || undefined, updated: fm.updated },
                body: text,
              }),
            })
          } catch {
            res = null
          }
          savingRef.current = false
          setSaving(false)
          if (!res) {
            toast({ status: 'error', title: 'Network error — not saved', description: 'Your edits are kept on this device.', position: 'bottom-right' })
            return false
          }
          const data = await readJsonObject(res)
          if (!res.ok) {
            if (res.status === 409 && data.code === 'VERSION_CONFLICT') {
              flushDraft()
              conflictBody.current = opts.bodyOverride
              setConflict(true)
              return false
            }
            if (res.status === 422 && data.code === 'MDX_INVALID') {
              const problem: MdxProblem = {
                line: typeof data.line === 'number' ? data.line : null,
                column: typeof data.column === 'number' ? data.column : null,
                reason: typeof data.reason === 'string' ? data.reason : 'The body does not compile',
              }
              setMdxError(problem)
              if (problem.line !== null) richRef.current?.jumpToLine(problem.line, problem.column ?? 1)
              return false
            }
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
            return false
          }
          setSessionExpired(false)
          setMdxError(null)
          setConflict(false)
          setRevalidated(parseRevalidated(data))
          if (opts.bodyOverride !== undefined) setBody(opts.bodyOverride)
          setServerBody(text)
          setBaseline(savedSnapshot)
          setEtag(typeof data.etag === 'string' ? data.etag : res.headers.get('ETag'))
          setSavedAt(Date.now())
          clearDraft()
          toast({
            ...saveToastCopy(data),
            title: text.trim() ? 'Saved — snapshot taken' : `/${name} is automatic again — snapshot taken`,
            position: 'bottom-right',
          })
          return true
        })(),
      )
    },
    [loadState, fm, body, etag, name, toast, flushDraft, clearDraft, track],
  )

  // "Save and leave": true only once the edits are stored; a 409 / 422 / 401,
  // a network error or a failed check keeps the page open with its explanation.
  useDirtyRegistration(`page:${name}`, dirty, () => leave(() => save()))

  const canSave = loadState === 'ready' && dirty && !saving
  useSaveShortcut(canSave, () => void save())
  const saveState: SaveState =
    loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : saving ? 'saving' : dirty ? 'dirty' : 'clean'

  const historyCurrent = useMemo(
    () => ({ frontmatter: { title: fm.title, description: fm.description, updated: fm.updated } as Record<string, unknown>, body }),
    [fm, body],
  )
  const copy = AUTO_COPY[name]

  return (
    <AdminPageShell
      headTitle={`Admin · /${name}`}
      eyebrow={`[admin] page · ${name}`}
      title={`Edit /${name}`}
      maxW="1440px"
      status={<SaveStatus state={saveState} savedAt={savedAt} label={saveState === 'dirty' ? 'Unsaved · draft kept on this device' : undefined} />}
      actions={
        <>
          <BackLink href="/admin">← Admin</BackLink>
          <Button as="a" href={`/${name}`} target="_blank" rel="noopener" size="sm" variant="ghost" color="page.fg-secondary">
            View live ↗
          </Button>
          {loadState === 'ready' ? (
            <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={() => setHistoryOpen(true)}>
              History
            </Button>
          ) : null}
          <SaveButton onSave={() => void save()} canSave={canSave} saving={saving} />
        </>
      }
    >
      <Stack spacing={4}>
        {loadState === 'error' ? <LoadErrorNotice what={`/${name}`} error={loadError} onRetry={() => setReloadKey((k) => k + 1)} /> : null}
        {sessionExpired ? <SessionExpiredNotice returnPath={`/admin/${name}`} keepEdits /> : null}
        {loadState === 'ready' && localDraft ? (
          <DraftBanner at={localDraft.at} stale={localDraftStale} onRestore={restoreDraft} onDiscard={discardDraft} />
        ) : null}
        {mdxError ? (
          <MdxErrorBanner
            problem={mdxError}
            onJump={() => mdxError.line && richRef.current?.jumpToLine(mdxError.line, mdxError.column ?? 1)}
            onDismiss={() => setMdxError(null)}
          />
        ) : null}
        {revalidated.length ? <RevalidatedPaths paths={revalidated} /> : null}

        {loadState === 'loading' ? (
          <Stack spacing={4} aria-busy="true" aria-label={`Loading /${name}`}>
            <Skeleton h="40px" />
            <Skeleton h="40px" />
            <Skeleton h="420px" />
          </Stack>
        ) : loadState === 'error' ? null : (
          <Stack spacing={4}>
            <Box maxW="var(--container-content)">
              <Stack spacing={4}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isRequired>
                    <FormLabel fontSize="13px">Title</FormLabel>
                    <Input {...inputProps} value={fm.title} onChange={(e) => setFm({ ...fm, title: e.target.value })} />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="13px">Updated</FormLabel>
                    <Input {...inputProps} type="date" value={fm.updated} onChange={(e) => setFm({ ...fm, updated: e.target.value })} />
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

                {automatic && !body.trim() ? (
                  <Box border="1px solid" borderColor="page.border-strong" borderRadius="lg" bg="var(--accent-soft)" px={4} py={3} role="region" aria-label={`Automatic /${name}`}>
                    <Text fontSize="sm" fontWeight={500}>
                      {copy.what}:
                    </Text>
                    {derivedError ? (
                      <Text fontSize="sm" color="page.fg-secondary" mt={1}>
                        (couldn’t load its sources: {derivedError})
                      </Text>
                    ) : !derived ? (
                      <Skeleton h="16px" mt={2} maxW="320px" />
                    ) : derived.sources.length ? (
                      <UnorderedList fontSize="sm" color="page.fg-secondary" mt={1} spacing={0.5}>
                        {derived.sources.map((src) => (
                          <ListItem key={src}>{src}</ListItem>
                        ))}
                      </UnorderedList>
                    ) : (
                      <Text fontSize="sm" color="page.fg-secondary" mt={1}>
                        nothing yet — it shows an honest “nothing to report” note until there is data.
                      </Text>
                    )}
                    <Flex gap={2} mt={3} flexWrap="wrap">
                      <Button as="a" href={`/${name}`} target="_blank" rel="noopener" size="sm" variant="ghost" color="page.fg-secondary">
                        View live ↗
                      </Button>
                      <Button size="sm" {...outlineButtonProps} isDisabled={!derived?.markdown} onClick={() => derived && setBody(derived.markdown)}>
                        Start from this
                      </Button>
                    </Flex>
                  </Box>
                ) : null}
              </Stack>
            </Box>

            <FormControl>
              <FormLabel fontSize="13px" id={`${name}-body-label`}>
                Body
              </FormLabel>
              <LivePreview
                body={body}
                headingIndex={headingIndex}
                idPrefix={`${name}-view`}
                editor={
                  <RichEditor
                    value={body}
                    onChange={setBody}
                    minH="520px"
                    labelledBy={`${name}-body-label`}
                    onHeadingIndex={setHeadingIndex}
                    handleRef={richRef}
                    placeholder="Write in Markdown. Drag, drop or paste images. Use the MDX tab for JSX components."
                  />
                }
              />
              <Flex mt={3} gap={3} align="center" justify="space-between" flexWrap="wrap">
                <Text fontSize="xs" color="page.fg-secondary" maxW="70ch">
                  {automatic ? copy.replaces : 'Clear the body and save to go back to the automatic page.'}
                </Text>
                {!automatic ? (
                  <Button size="sm" variant="ghost" color="page.fg-secondary" onClick={() => setRevertOpen(true)} isDisabled={saving}>
                    Revert to automatic
                  </Button>
                ) : null}
              </Flex>
            </FormControl>
          </Stack>
        )}
      </Stack>

      {loadState === 'ready' ? (
        <ItemHistoryDrawer
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          kind="page"
          itemRef={name}
          current={historyCurrent}
          dirty={dirty}
          onRestored={() => {
            discardDraft()
            setReloadKey((k) => k + 1)
          }}
        />
      ) : null}

      <ConflictDialog
        isOpen={conflict}
        noun="page"
        saving={saving}
        onCancel={() => setConflict(false)}
        onReload={() => {
          flushDraft()
          setConflict(false)
          setReloadKey((k) => k + 1)
        }}
        onOverwrite={() => void save({ force: true, bodyOverride: conflictBody.current })}
      />

      <AlertDialog isOpen={revertOpen} leastDestructiveRef={revertCancelRef} onClose={() => setRevertOpen(false)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
            <AlertDialogHeader fontSize="md">Go back to the automatic /{name}?</AlertDialogHeader>
            <AlertDialogBody fontSize="sm">
              This saves an empty body, so visitors see the page built from your data again. The current text is snapshotted
              first — restore it any time from History.
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={revertCancelRef} size="sm" {...outlineButtonProps} onClick={() => setRevertOpen(false)}>
                Keep my text
              </Button>
              <Button
                size="sm"
                colorScheme="red"
                isLoading={saving}
                onClick={async () => {
                  await save({ bodyOverride: '' })
                  setRevertOpen(false)
                }}
              >
                Revert to automatic
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
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
