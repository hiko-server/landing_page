import React, { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Skeleton,
  Stack,
  useToast,
} from '@chakra-ui/react'
import dynamic from 'next/dynamic'
import { FaEllipsisH } from 'react-icons/fa'
import {
  AdminPageShell,
  BackLink,
  KbdHint,
  LoadErrorNotice,
  RevalidatedPaths,
  SaveStatus,
  SessionExpiredNotice,
  outlineButtonProps,
  primaryButtonProps,
  useSaveKeys,
} from '../shell/ui'
import type { useMdxItemEditor } from '../shell/useMdxItemEditor'
import LivePreview from '../shell/LivePreview'
import ItemHistoryDrawer from '../shell/ItemHistoryDrawer'
import PublishSheet from '../shell/PublishSheet'
import type { CheckField, PublishCheckInput } from '../shell/publishChecks'
import { canPublishChanges } from '../shell/pendingChanges'
import { ConflictDialog, DraftBanner, MdxErrorBanner } from './EditorNotices'
import { DiscardChangesDialog, PendingChangesBanner } from './PendingChanges'
import WritingBar, { useWritingModes } from './WritingBar'
import SeoSection from './SeoSection'
import ScheduleBanner from './ScheduleBanner'
import { isScheduled, scheduleSummary } from '../shell/itemSchedule'
import { useStickyRef } from '../shell/stickyRef'

// Opened on demand: scheduling (H5) and review links (H5) load with their dialogs.
const ScheduleDialog = dynamic(() => import('./ScheduleDialog'), { ssr: false })
const ReviewLinksDialog = dynamic(() => import('./ReviewLinksDialog'), { ssr: false })

// TipTap touches the DOM during init — client-side only.
const RichEditor = dynamic(() => import('../RichEditor'), {
  ssr: false,
  loading: () => <Skeleton h="500px" borderRadius="lg" />,
})

/**
 * Page frame shared by the post and case-study editors: title bar with the
 * publish actions, local-draft banner, compile-error banner, the writing bar
 * and the body editor with live preview, "Search & sharing", the history
 * drawer, the publish sheet and the "changed elsewhere" dialog. The page
 * supplies its own metadata fields; field inputs use the ids `item-title`,
 * `item-description`, `item-slug` and `item-cover` so the publish checklist
 * can focus them.
 *
 * Actions follow the item's state (H4):
 *   draft / new  Save draft (⌘S) · Publish…
 *   published    Save changes (⌘S) — stored as unpublished changes, the
 *                public page keeps the published version — and
 *                Publish changes… (a diff against the live version, then
 *                live). A banner shows saved, unpublished changes with
 *                Preview ↗ (Draft Mode) and Discard….
 *
 * Scheduling (H5): "Schedule…" (in the publish sheet and the ⋯ menu) sets
 * when the draft or the saved changes go live and when the item unpublishes;
 * a banner shows it with Change… / Unschedule. "Share for review…" makes
 * private, expiring preview links of the draft or the changes.
 */

type ItemFm = Record<string, unknown> & { draft: boolean; title: string; description: string; cover: string }
type Ed<F extends ItemFm> = ReturnType<typeof useMdxItemEditor<F>>

/**
 * A button label that is shorter on a phone ("Save", "Publish…") and in full
 * from sm up ("Save changes", "Publish changes…"). Two whole labels, one
 * shown: the accessible name is always exactly the visible one.
 */
function PhoneLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <Box as="span" display={{ base: 'inline', sm: 'none' }}>
        {short}
      </Box>
      <Box as="span" display={{ base: 'none', sm: 'inline' }}>
        {full}
      </Box>
    </>
  )
}

const todayISO = () => new Date().toISOString().slice(0, 10)
/** The first of these controls that is on the page and enabled (focus() on a disabled one does nothing). */
const firstUsable = (...els: Array<HTMLElement | null>) => els.find((el) => !!el && el.isConnected && !(el as HTMLButtonElement).disabled) ?? null
const textField = (fm: Record<string, unknown>, key: string) => (typeof fm[key] === 'string' ? (fm[key] as string) : '')

export default function MdxItemEditorFrame<F extends ItemFm>({
  ed,
  collection,
  noun,
  backHref,
  backLabel,
  newTitle,
  fields,
  aboveBody,
  publishExtra,
}: {
  ed: Ed<F>
  collection: 'blog' | 'work'
  noun: string
  backHref: string
  backLabel: string
  newTitle: string
  /** Metadata fields rendered above the body (they include the cover field). */
  fields: React.ReactNode
  /** Rendered between the fields and the body (e.g. the case-study template card). */
  aboveBody?: React.ReactNode
  /** More inputs for the publish checklist (measured cover width, At a glance fields). */
  publishExtra?: Pick<PublishCheckInput, 'coverWidth' | 'summary' | 'outcomes'>
}) {
  const saveKeys = useSaveKeys()
  const modes = useWritingModes()
  const toast = useToast()
  const [headingIndex, setHeadingIndex] = useState(-1)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [markUpdated, setMarkUpdated] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Keyboard focus never falls to the top of the page when a control goes
  // away under it: the publish sheet's "Schedule…" (the sheet closes as the
  // dialog opens) or the schedule banner (gone once unscheduled).
  // Sticky: read while the dialog unmounts, when a re-merged menu-button ref is briefly null.
  const [publishBtnRef, setPublishBtn] = useStickyRef<HTMLButtonElement>()
  const [moreBtnRef, setMoreBtn] = useStickyRef<HTMLButtonElement>()
  const [bannerChangeRef, setBannerChange] = useStickyRef<HTMLButtonElement>()
  const scheduleFrom = useRef<'sheet' | 'menu' | 'banner'>('menu')
  const refocusAfterUnschedule = useRef(false)
  // Read as the dialog closes: back to the opener, else the next sensible control.
  const scheduleReturn = useMemo<RefObject<HTMLElement>>(
    () => ({
      get current() {
        const publish = publishBtnRef.current
        const more = moreBtnRef.current
        if (scheduleFrom.current === 'banner') return firstUsable(bannerChangeRef.current, publish, more)
        if (scheduleFrom.current === 'sheet') return firstUsable(publish, more)
        return firstUsable(more, publish)
      },
    }),
    [publishBtnRef, moreBtnRef, bannerChangeRef],
  )
  const openSchedule = (from: 'sheet' | 'menu' | 'banner') => {
    scheduleFrom.current = from
    setScheduleOpen(true)
  }
  const { fm } = ed
  const published = ed.mode === 'published'
  const hasPending = !!ed.pending
  const ready = ed.loadState === 'ready'
  const livePath = ed.slugParam ? `/${collection}/${ed.slugParam}` : ''
  const previewHref = `/api/admin/draft?path=${encodeURIComponent(livePath)}`
  const bodyLabelId = `${collection}-body-label`
  const changesReady = canPublishChanges({ mode: ed.mode, hasPending, dirty: ed.dirty })
  const scheduled = isScheduled(ed.schedule) ? ed.schedule : null
  const scheduledLine = scheduled ? scheduleSummary(scheduled, Date.now()) : null

  // Unscheduled from the banner: the banner (and its focused button) is gone.
  useEffect(() => {
    if (scheduled || !refocusAfterUnschedule.current) return
    refocusAfterUnschedule.current = false
    firstUsable(publishBtnRef.current, moreBtnRef.current)?.focus()
  }, [scheduled, publishBtnRef, moreBtnRef])

  // "Mark as updated today" starts unticked every time the sheet opens.
  useEffect(() => {
    if (publishOpen) setMarkUpdated(false)
  }, [publishOpen])

  const historyCurrent = useMemo(() => ({ frontmatter: ed.serverFrontmatter, body: ed.body }), [ed.serverFrontmatter, ed.body])
  const publishInput = useMemo(
    () => ({ title: String(fm.title || ''), description: String(fm.description || ''), body: ed.body, slug: ed.slug, cover: String(fm.cover || ''), ...publishExtra }),
    [fm.title, fm.description, fm.cover, ed.body, ed.slug, publishExtra],
  )
  // What "Publish changes" replaces (the live version) and what goes live.
  const changesDiff = useMemo(() => {
    if (!published || !ed.live) return undefined
    const after = markUpdated && collection === 'blog' ? { ...ed.serverFrontmatter, updated: todayISO() } : ed.serverFrontmatter
    return { before: { frontmatter: ed.live.frontmatter, body: ed.live.body }, after: { frontmatter: after, body: ed.body } }
  }, [published, ed.live, ed.serverFrontmatter, ed.body, markUpdated, collection])

  const { richRef, setBody, setFm } = ed
  const focusField = useCallback(
    (field: CheckField, line?: number, column?: number) => {
      if (field === 'body') {
        requestAnimationFrame(() => {
          if (line) richRef.current?.jumpToLine(line, column ?? 1)
          else richRef.current?.focus()
        })
        return
      }
      requestAnimationFrame(() => {
        const el = document.getElementById(`item-${field}`)
        el?.focus()
        el?.scrollIntoView({ block: 'center' })
      })
    },
    [richRef],
  )

  const replaceUrl = useCallback(
    (from: string, to: string, target: 'body' | 'cover') => {
      if (target === 'cover') setFm((f) => ({ ...f, cover: to }) as F)
      else setBody(ed.body.split(from).join(to))
    },
    [setFm, setBody, ed.body],
  )

  const setText = useCallback((key: string, value: string) => setFm((f) => ({ ...f, [key]: value }) as F), [setFm])

  const statusLabel = ed.saveState === 'dirty' ? 'Unsaved · draft kept on this device' : ed.saveState === 'clean' && hasPending ? 'Saved · not live yet' : undefined

  return (
    <AdminPageShell
      headTitle={ed.isNew ? `Admin · ${newTitle}` : `Admin · Edit ${ed.slugParam}`}
      eyebrow={`[admin] ${collection} · ${ed.isNew ? 'new' : 'edit'}`}
      title={ed.isNew ? newTitle : String(fm.title || '') || ed.slugParam}
      maxW="1440px"
      status={
        // Phones: the state is a row of its own above the actions.
        <HStack spacing={2} flexWrap="wrap" rowGap={1} w={{ base: '100%', md: 'auto' }}>
          {ready && !ed.isNew ? (
            <Badge colorScheme={published ? 'green' : 'yellow'} variant="subtle" fontSize="10px">
              {published ? 'published' : 'draft'}
            </Badge>
          ) : null}
          {ready && hasPending ? (
            <Badge colorScheme="purple" variant="subtle" fontSize="10px" data-testid="pending-badge">
              changes not live
            </Badge>
          ) : null}
          {ready && scheduled ? (
            <Badge colorScheme="blue" variant="subtle" fontSize="10px" data-testid="schedule-badge" title={scheduledLine ?? undefined}>
              scheduled
            </Badge>
          ) : null}
          <SaveStatus state={ed.saveState} savedAt={ed.savedAt} label={statusLabel} />
        </HStack>
      }
      actions={
        <>
          <BackLink href={backHref}>{backLabel}</BackLink>
          {!ed.isNew && ready ? (
            <Menu placement="bottom-end" isLazy>
              <MenuButton ref={setMoreBtn} as={IconButton} size="sm" variant="ghost" icon={<FaEllipsisH />} aria-label="More actions" color="page.fg-secondary" />
              <MenuList bg="page.bg-elevated" borderColor="page.border" fontSize="sm" zIndex={40}>
                {published ? (
                  <>
                    <MenuItem as="a" href={livePath} target="_blank" rel="noopener" bg="transparent">
                      View live ↗
                    </MenuItem>
                    <MenuItem as="a" href={`/admin/dashboard?tab=analytics&f=${encodeURIComponent(`page:is:${livePath}`)}`} target="_blank" rel="noopener" bg="transparent">
                      Analytics for this page ↗
                    </MenuItem>
                    {hasPending ? (
                      <MenuItem as="a" href={previewHref} target="_blank" rel="noopener" bg="transparent">
                        Preview unpublished changes ↗
                      </MenuItem>
                    ) : null}
                  </>
                ) : (
                  <MenuItem as="a" href={previewHref} target="_blank" rel="noopener" bg="transparent">
                    Preview draft ↗
                  </MenuItem>
                )}
                <MenuItem onClick={() => setHistoryOpen(true)} bg="transparent">
                  History…
                </MenuItem>
                <MenuItem onClick={() => openSchedule('menu')} bg="transparent">
                  {scheduled ? 'Change schedule…' : 'Schedule…'}
                </MenuItem>
                <MenuItem onClick={() => setReviewOpen(true)} bg="transparent">
                  Share for review…
                </MenuItem>
                {published ? (
                  <>
                    <MenuDivider />
                    {hasPending ? (
                      <MenuItem onClick={() => setDiscardOpen(true)} isDisabled={ed.saving} bg="transparent">
                        Discard unpublished changes…
                      </MenuItem>
                    ) : null}
                    <MenuItem onClick={() => void ed.save({ draft: true })} isDisabled={ed.saving} bg="transparent">
                      Unpublish (back to draft)
                    </MenuItem>
                  </>
                ) : null}
              </MenuList>
            </Menu>
          ) : null}
          <HStack spacing={2} flexWrap="wrap" rowGap={2}>
            <KbdHint keys={saveKeys} />
            <Button
              size="sm"
              {...outlineButtonProps}
              onClick={() => void ed.save()}
              isDisabled={!ed.canSave}
              isLoading={ed.saving && !publishOpen}
              loadingText="Saving"
              aria-keyshortcuts={saveKeys[0] === '⌘' ? 'Meta+S' : 'Control+S'}
              title={published ? 'Saved as unpublished changes — visitors keep seeing the published version' : undefined}
            >
              {/* Phones: "Save" / "Publish…", so the actions fit on one row. */}
              <PhoneLabel short="Save" full={published ? 'Save changes' : 'Save draft'} />
            </Button>
            {published ? (
              <Button
                ref={setPublishBtn}
                size="sm"
                {...primaryButtonProps}
                onClick={() => setPublishOpen(true)}
                isDisabled={!ready || ed.saving || !changesReady}
                title={changesReady ? undefined : 'Nothing to publish — the live version matches the editor'}
              >
                <PhoneLabel short="Publish…" full="Publish changes…" />
              </Button>
            ) : (
              <Button ref={setPublishBtn} size="sm" {...primaryButtonProps} onClick={() => setPublishOpen(true)} isDisabled={!ready || ed.saving}>
                Publish…
              </Button>
            )}
          </HStack>
        </>
      }
    >
      <Stack spacing={4}>
        {ed.loadState === 'error' ? <LoadErrorNotice what={`this ${noun}`} error={ed.loadError} onRetry={ed.retry} /> : null}
        {ed.sessionExpired ? <SessionExpiredNotice returnPath={backHref} keepEdits /> : null}
        {ready && ed.localDraft ? (
          <DraftBanner at={ed.localDraft.at} stale={ed.localDraftStale} onRestore={ed.restoreDraft} onDiscard={ed.discardDraft} />
        ) : null}
        {ready && scheduled ? (
          <ScheduleBanner
            schedule={scheduled}
            noun={noun}
            busy={ed.saving}
            changeRef={setBannerChange}
            onChange={() => openSchedule('banner')}
            onClear={async () => {
              refocusAfterUnschedule.current = true
              const out = await ed.setSchedule({ publishAt: null, unpublishAt: null })
              if (!out.ok) {
                refocusAfterUnschedule.current = false
                toast({ status: 'error', title: 'Couldn’t unschedule', description: out.error, position: 'bottom-right' })
              } else toast({ status: 'success', title: 'Unscheduled', description: `Nothing happens to this ${noun} on its own any more.`, position: 'bottom-right' })
              return out.ok
            }}
          />
        ) : null}
        {ready && published && ed.pending ? (
          <PendingChangesBanner
            noun={noun}
            savedAt={ed.pending.updatedAt}
            stale={ed.pendingStale}
            previewHref={previewHref}
            onReview={() => setPublishOpen(true)}
            onDiscard={() => setDiscardOpen(true)}
            busy={ed.saving}
          />
        ) : null}
        {ed.mdxError ? (
          <MdxErrorBanner
            problem={ed.mdxError}
            onJump={() => ed.mdxError?.line && richRef.current?.jumpToLine(ed.mdxError.line, ed.mdxError.column ?? 1)}
            onDismiss={ed.dismissMdxError}
          />
        ) : null}
        {ed.revalidated.length ? <RevalidatedPaths paths={ed.revalidated} /> : null}

        {ed.loadState === 'loading' ? (
          <Stack spacing={4} aria-busy="true" aria-label={`Loading ${noun}`}>
            <Skeleton h="40px" />
            <Skeleton h="40px" />
            <Skeleton h="420px" />
          </Stack>
        ) : ed.loadState === 'error' ? null : (
          <Stack spacing={4}>
            <Box maxW="var(--container-content)">{fields}</Box>
            {aboveBody}
            <Box role="group" aria-labelledby={bodyLabelId}>
              <WritingBar
                body={ed.body}
                labelId={bodyLabelId}
                save={{
                  state: ed.saveState,
                  isNew: ed.isNew,
                  mode: ed.mode,
                  hasPending,
                  savedAt: ed.savedAt,
                  savedLocallyAt: ed.savedLocallyAt,
                }}
                focusMode={modes.focusMode}
                typewriter={modes.typewriter}
                onToggleFocus={modes.toggleFocus}
                onToggleTypewriter={modes.toggleTypewriter}
                onFind={() => richRef.current?.openFind()}
              />
              <LivePreview
                body={ed.body}
                headingIndex={headingIndex}
                idPrefix={`${collection}-view`}
                editor={
                  <RichEditor
                    value={ed.body}
                    onChange={ed.setBody}
                    minH="500px"
                    labelledBy={bodyLabelId}
                    onHeadingIndex={setHeadingIndex}
                    handleRef={richRef}
                    focusMode={modes.focusMode}
                    typewriter={modes.typewriter}
                    placeholder="Write in Markdown. Drag, drop or paste images. Use the MDX tab for JSX components."
                  />
                }
              />
            </Box>
            <Box maxW="var(--container-content)">
              <SeoSection
                collection={collection}
                slug={ed.slug}
                title={String(fm.title || '')}
                description={String(fm.description || '')}
                body={ed.body}
                seoTitle={textField(fm, 'seoTitle')}
                onSeoTitle={(v) => setText('seoTitle', v)}
                lang={textField(fm, 'lang')}
                onLang={(v) => setText('lang', v)}
                tags={ed.list}
                cover={String(fm.cover || '')}
                coverAlt={textField(fm, 'coverAlt')}
                coverFocus={textField(fm, 'coverFocus')}
                date={collection === 'blog' ? textField(fm, 'date') : undefined}
                updated={collection === 'blog' ? textField(fm, 'updated') : undefined}
                onUpdated={collection === 'blog' ? (v) => setText('updated', v) : undefined}
              />
            </Box>
          </Stack>
        )}
      </Stack>

      {!ed.isNew && ready ? (
        <ItemHistoryDrawer
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          kind={collection}
          itemRef={ed.slugParam}
          current={historyCurrent}
          dirty={ed.dirty}
          onRestored={ed.reloadAfterRestore}
        />
      ) : null}
      {ready ? (
        <PublishSheet
          isOpen={publishOpen}
          onClose={() => setPublishOpen(false)}
          collection={collection}
          input={publishInput}
          publishing={ed.saving}
          onPublish={() => (published ? ed.publishChanges(collection === 'blog' && markUpdated) : ed.save({ draft: false }))}
          onFocusField={focusField}
          onReplaceUrl={replaceUrl}
          mode={published ? 'changes' : 'publish'}
          diff={changesDiff}
          markUpdated={published && collection === 'blog' ? { checked: markUpdated, onChange: setMarkUpdated } : undefined}
          stale={ed.pendingStale}
          onSchedule={
            ed.isNew
              ? undefined
              : () => {
                  setPublishOpen(false)
                  openSchedule('sheet')
                }
          }
        />
      ) : null}
      {!ed.isNew && ready && scheduleOpen ? (
        <ScheduleDialog
          isOpen={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          finalFocusRef={scheduleReturn}
          collection={collection}
          mode={published ? 'published' : 'draft'}
          hasChanges={hasPending || ed.dirty}
          dirty={ed.dirty}
          schedule={ed.schedule}
          itemDate={collection === 'blog' ? textField(fm, 'date') : textField(fm, 'published')}
          setSchedule={async (change) => {
            const out = await ed.setSchedule(change)
            if (out.ok) {
              const cleared = change.publishAt === null && change.unpublishAt === null
              toast({
                status: 'success',
                title: cleared ? 'Unscheduled' : 'Scheduled',
                description: cleared ? undefined : 'The site does it on time — you don’t need to be online.',
                position: 'bottom-right',
              })
            }
            return out
          }}
        />
      ) : null}
      {!ed.isNew && ready && reviewOpen ? (
        <ReviewLinksDialog isOpen={reviewOpen} onClose={() => setReviewOpen(false)} collection={collection} slug={ed.slugParam} noun={noun} dirty={ed.dirty} />
      ) : null}
      {published ? (
        <DiscardChangesDialog isOpen={discardOpen} noun={noun} dirty={ed.dirty} onCancel={() => setDiscardOpen(false)} onConfirm={ed.discardPending} />
      ) : null}
      <ConflictDialog
        isOpen={ed.conflict}
        noun={noun}
        saving={ed.saving}
        onCancel={ed.dismissConflict}
        onReload={ed.reload}
        onOverwrite={() => void ed.overwrite()}
      />
    </AdminPageShell>
  )
}
