import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
 */

type ItemFm = Record<string, unknown> & { draft: boolean; title: string; description: string; cover: string }
type Ed<F extends ItemFm> = ReturnType<typeof useMdxItemEditor<F>>

const todayISO = () => new Date().toISOString().slice(0, 10)
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
  const [headingIndex, setHeadingIndex] = useState(-1)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [markUpdated, setMarkUpdated] = useState(false)
  const { fm } = ed
  const published = ed.mode === 'published'
  const hasPending = !!ed.pending
  const ready = ed.loadState === 'ready'
  const livePath = ed.slugParam ? `/${collection}/${ed.slugParam}` : ''
  const previewHref = `/api/admin/draft?path=${encodeURIComponent(livePath)}`
  const bodyLabelId = `${collection}-body-label`
  const changesReady = canPublishChanges({ mode: ed.mode, hasPending, dirty: ed.dirty })

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
        <HStack spacing={2} flexWrap="wrap" rowGap={1}>
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
          <SaveStatus state={ed.saveState} savedAt={ed.savedAt} label={statusLabel} />
        </HStack>
      }
      actions={
        <>
          <BackLink href={backHref}>{backLabel}</BackLink>
          {!ed.isNew && ready ? (
            <Menu placement="bottom-end" isLazy>
              <MenuButton as={IconButton} size="sm" variant="ghost" icon={<FaEllipsisH />} aria-label="More actions" color="page.fg-secondary" />
              <MenuList bg="page.bg-elevated" borderColor="page.border" fontSize="sm" zIndex={40}>
                {published ? (
                  <>
                    <MenuItem as="a" href={livePath} target="_blank" rel="noopener" bg="transparent">
                      View live ↗
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
              {published ? 'Save changes' : 'Save draft'}
            </Button>
            {published ? (
              <Button
                size="sm"
                {...primaryButtonProps}
                onClick={() => setPublishOpen(true)}
                isDisabled={!ready || ed.saving || !changesReady}
                title={changesReady ? undefined : 'Nothing to publish — the live version matches the editor'}
              >
                Publish changes…
              </Button>
            ) : (
              <Button size="sm" {...primaryButtonProps} onClick={() => setPublishOpen(true)} isDisabled={!ready || ed.saving}>
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
        />
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
