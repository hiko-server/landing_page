import React, { useCallback, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
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
import { ConflictDialog, DraftBanner, MdxErrorBanner } from './EditorNotices'

// TipTap touches the DOM during init — client-side only.
const RichEditor = dynamic(() => import('../RichEditor'), {
  ssr: false,
  loading: () => <Skeleton h="500px" borderRadius="lg" />,
})

/**
 * Page frame shared by the post and case-study editors: title bar with the
 * publish actions (Save draft / Publish… for drafts, Update + Unpublish for
 * published items), local-draft banner, compile-error banner, the body
 * editor with live preview, the history drawer, the publish sheet and the
 * "changed elsewhere" dialog. The page supplies its own metadata fields;
 * field inputs use the ids `item-title`, `item-description`, `item-slug` and
 * `item-cover` so the publish checklist can focus them.
 */

type ItemFm = Record<string, unknown> & { draft: boolean; title: string; description: string; cover: string }
type Ed<F extends ItemFm> = ReturnType<typeof useMdxItemEditor<F>>

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
  const [headingIndex, setHeadingIndex] = useState(-1)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const { fm } = ed
  const isDraft = ed.isNew || fm.draft
  const ready = ed.loadState === 'ready'
  const livePath = ed.slugParam ? `/${collection}/${ed.slugParam}` : ''
  const bodyLabelId = `${collection}-body-label`

  const historyCurrent = useMemo(() => ({ frontmatter: ed.serverFrontmatter, body: ed.body }), [ed.serverFrontmatter, ed.body])
  const publishInput = useMemo(
    () => ({ title: String(fm.title || ''), description: String(fm.description || ''), body: ed.body, slug: ed.slug, cover: String(fm.cover || ''), ...publishExtra }),
    [fm.title, fm.description, fm.cover, ed.body, ed.slug, publishExtra],
  )

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

  const statusLabel = ed.saveState === 'dirty' ? 'Unsaved · draft kept on this device' : undefined

  return (
    <AdminPageShell
      headTitle={ed.isNew ? `Admin · ${newTitle}` : `Admin · Edit ${ed.slugParam}`}
      eyebrow={`[admin] ${collection} · ${ed.isNew ? 'new' : 'edit'}`}
      title={ed.isNew ? newTitle : String(fm.title || '') || ed.slugParam}
      maxW="1440px"
      status={
        <HStack spacing={2}>
          {ready && !ed.isNew ? (
            <Badge colorScheme={fm.draft ? 'yellow' : 'green'} variant="subtle" fontSize="10px">
              {fm.draft ? 'draft' : 'published'}
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
                {fm.draft ? (
                  <MenuItem as="a" href={`/api/admin/draft?path=${encodeURIComponent(livePath)}`} target="_blank" rel="noopener" bg="transparent">
                    Preview draft ↗
                  </MenuItem>
                ) : (
                  <MenuItem as="a" href={livePath} target="_blank" rel="noopener" bg="transparent">
                    View live ↗
                  </MenuItem>
                )}
                <MenuItem onClick={() => setHistoryOpen(true)} bg="transparent">
                  History…
                </MenuItem>
                {!fm.draft ? (
                  <>
                    <MenuDivider />
                    <MenuItem onClick={() => void ed.save({ draft: true })} isDisabled={ed.saving} bg="transparent">
                      Unpublish (back to draft)
                    </MenuItem>
                  </>
                ) : null}
              </MenuList>
            </Menu>
          ) : null}
          <HStack spacing={2}>
            <KbdHint keys={saveKeys} />
            <Button
              size="sm"
              {...(isDraft ? outlineButtonProps : primaryButtonProps)}
              onClick={() => void ed.save()}
              isDisabled={!ed.canSave}
              isLoading={ed.saving && !publishOpen}
              loadingText="Saving"
              aria-keyshortcuts={saveKeys[0] === '⌘' ? 'Meta+S' : 'Control+S'}
            >
              {isDraft ? 'Save draft' : 'Update'}
            </Button>
            {isDraft ? (
              <Button size="sm" {...primaryButtonProps} onClick={() => setPublishOpen(true)} isDisabled={!ready || ed.saving}>
                Publish…
              </Button>
            ) : null}
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
            <FormControl>
              <FormLabel fontSize="13px" id={bodyLabelId}>
                Body
              </FormLabel>
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
                    placeholder="Write in Markdown. Drag, drop or paste images. Use the MDX tab for JSX components."
                  />
                }
              />
            </FormControl>
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
          onPublish={() => ed.save({ draft: false })}
          onFocusField={focusField}
          onReplaceUrl={replaceUrl}
        />
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
