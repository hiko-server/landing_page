import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Spinner,
  Stack,
  Text,
  useBreakpointValue,
  useToast,
} from '@chakra-ui/react'
import { readJsonObject } from './http'
import { canPublish, runPublishChecks, type CheckField, type PublishCheck } from './publishChecks'
import { Eyebrow, MONO, outlineButtonProps, primaryButtonProps } from './ui'
import { importRemoteImage } from '../editor/upload'

/**
 * "Publish…" sheet for posts and case studies: a compile dry run with the
 * public renderer (POST /api/admin/preview), the pre-publish checklist
 * (publishChecks.ts) with a link to each field, one-click import of
 * images hosted elsewhere, and the public pages the publish will refresh.
 * Warnings never block; a compile error (or a missing title / slug) does.
 * Bottom sheet on phones, right-hand drawer from md.
 */

type Compile = { state: 'pending' } | { state: 'ok' } | { state: 'error'; line: number | null; column: number | null; reason: string } | { state: 'unknown'; reason: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  collection: 'blog' | 'work'
  input: { title: string; description: string; body: string; slug: string; cover: string }
  /** Save with draft = false; resolves true when it went live. */
  onPublish: () => Promise<boolean>
  publishing: boolean
  /** Move focus to a field (and line, for the body). */
  onFocusField: (field: CheckField, line?: number, column?: number) => void
  /** Replace an image URL after importing it (exact string replace). */
  onReplaceUrl: (from: string, to: string, target: 'body' | 'cover') => void
}

const MAX_SIBLING_PAGES = 50

const LEVEL_COPY: Record<PublishCheck['level'], { mark: string; color: string; sr: string }> = {
  ok: { mark: '✓', color: 'green.400', sr: 'Passed' },
  warning: { mark: '!', color: 'orange.400', sr: 'Warning' },
  error: { mark: '×', color: 'red.400', sr: 'Blocking' },
}

const FIELD_LABEL: Record<CheckField, string> = {
  title: 'Title',
  description: 'Description',
  slug: 'Slug',
  cover: 'Cover image',
  body: 'Body',
}

async function fetchSlugs(endpoint: string): Promise<string[]> {
  const res = await fetch(endpoint, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await readJsonObject(res)
  return Array.isArray(data.items) ? data.items.map((i: { slug?: unknown }) => String(i.slug || '')).filter(Boolean) : []
}

export default function PublishSheet({ isOpen, onClose, collection, input, onPublish, publishing, onFocusField, onReplaceUrl }: Props) {
  const toast = useToast()
  const placement = useBreakpointValue<'bottom' | 'right'>({ base: 'bottom', md: 'right' }, { ssr: false }) ?? 'right'
  const [known, setKnown] = useState<{ blog: string[]; work: string[] } | null>(null)
  const [knownError, setKnownError] = useState(false)
  const [compile, setCompile] = useState<Compile>({ state: 'pending' })
  const [importing, setImporting] = useState<string | null>(null)

  // Slugs for the internal-link check (drafts included).
  useEffect(() => {
    if (!isOpen) return
    let alive = true
    setKnownError(false)
    Promise.all([fetchSlugs('/api/admin/posts'), fetchSlugs('/api/admin/work')])
      .then(([blog, work]) => alive && setKnown({ blog, work }))
      .catch(() => alive && setKnownError(true))
    return () => {
      alive = false
    }
  }, [isOpen])

  // Compile dry run of the current body.
  useEffect(() => {
    if (!isOpen) return
    const ctrl = new AbortController()
    setCompile({ state: 'pending' })
    void (async () => {
      try {
        const res = await fetch('/api/admin/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: input.body }),
          signal: ctrl.signal,
        })
        const data = await readJsonObject(res)
        if (ctrl.signal.aborted) return
        if (res.ok) setCompile({ state: 'ok' })
        else if (res.status === 422)
          setCompile({
            state: 'error',
            line: typeof data.line === 'number' ? data.line : null,
            column: typeof data.column === 'number' ? data.column : null,
            reason: typeof data.reason === 'string' ? data.reason : 'The body does not compile',
          })
        else
          setCompile({
            state: 'unknown',
            reason: res.status === 429 ? 'Too many checks in a short time — the save will still compile it.' : `Couldn’t check (HTTP ${res.status}) — the save still compiles it.`,
          })
      } catch {
        if (!ctrl.signal.aborted) setCompile({ state: 'unknown', reason: 'Network error — the save still compiles it.' })
      }
    })()
    return () => ctrl.abort()
  }, [isOpen, input.body])

  const checks = useMemo(
    () =>
      runPublishChecks({
        ...input,
        collection,
        knownSlugs: known || { blog: [], work: [] },
      }).filter((c) => known || !c.id.startsWith('link-')),
    [input, collection, known],
  )

  // Mirrors lib/revalidate collectionPaths: the index, the item and up to 50
  // sibling detail pages (their prev/next and related links).
  const detailPath = input.slug ? `/${collection}/${input.slug}` : null
  const others = useMemo(() => {
    const siblings = known ? known[collection].filter((s) => s !== input.slug) : []
    return Math.min(siblings.length, MAX_SIBLING_PAGES)
  }, [collection, input.slug, known])

  const blocked = compile.state === 'error' || compile.state === 'pending' || !canPublish(checks)

  const importImage = async (check: PublishCheck) => {
    if (!check.importUrl) return
    setImporting(check.importUrl)
    try {
      const img = await importRemoteImage(check.importUrl)
      onReplaceUrl(check.importUrl, img.url, check.field === 'cover' ? 'cover' : 'body')
      toast({
        status: img.warning ? 'warning' : 'success',
        title: 'Image imported',
        description: img.warning || `Now served from ${img.url}`,
        position: 'bottom-right',
      })
    } catch (e) {
      toast({ status: 'error', title: 'Import failed', description: e instanceof Error ? e.message : String(e), position: 'bottom-right' })
    } finally {
      setImporting(null)
    }
  }

  const publish = async () => {
    if (await onPublish()) onClose()
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement={placement} size="md">
      <DrawerOverlay />
      <DrawerContent
        bg="page.bg-elevated"
        borderColor="page.border"
        borderLeft={placement === 'right' ? '1px solid' : undefined}
        borderTop={placement === 'bottom' ? '1px solid' : undefined}
        borderTopRadius={placement === 'bottom' ? 'xl' : undefined}
        maxH={placement === 'bottom' ? '88vh' : undefined}
      >
        <DrawerCloseButton />
        <DrawerHeader pb={2}>
          <Eyebrow accent>[publish]</Eyebrow>
          <Text fontSize="md" fontWeight={600} mt={1}>
            Ready to publish?
          </Text>
        </DrawerHeader>
        <DrawerBody>
          <Stack spacing={5}>
            <Box>
              <Eyebrow mb={2}>Renders</Eyebrow>
              <Flex align="flex-start" gap={2.5} fontSize="sm" role="status" aria-live="polite">
                {compile.state === 'pending' ? (
                  <>
                    <Spinner size="xs" mt={1} />
                    <Text>Compiling with the site’s renderer…</Text>
                  </>
                ) : compile.state === 'ok' ? (
                  <>
                    <Text as="span" color="green.400" fontWeight={700} aria-hidden>
                      ✓
                    </Text>
                    <Text>The body compiles.</Text>
                  </>
                ) : compile.state === 'error' ? (
                  <>
                    <Text as="span" color="red.400" fontWeight={700} aria-hidden>
                      ×
                    </Text>
                    <Box>
                      <Text>
                        {compile.line !== null ? `Line ${compile.line}${compile.column !== null ? `:${compile.column}` : ''}: ` : ''}
                        {compile.reason}
                      </Text>
                      <Button
                        size="xs"
                        variant="link"
                        color="accent.text"
                        mt={1}
                        onClick={() => {
                          onClose()
                          onFocusField('body', compile.line ?? undefined, compile.column ?? undefined)
                        }}
                      >
                        Go to the error
                      </Button>
                    </Box>
                  </>
                ) : (
                  <>
                    <Text as="span" color="orange.400" fontWeight={700} aria-hidden>
                      !
                    </Text>
                    <Text>{compile.reason}</Text>
                  </>
                )}
              </Flex>
            </Box>

            <Box>
              <Eyebrow mb={2}>Checklist</Eyebrow>
              <Stack as="ul" listStyleType="none" spacing={2.5}>
                {checks.map((c) => {
                  const lv = LEVEL_COPY[c.level]
                  return (
                    <Flex as="li" key={c.id} gap={2.5} align="flex-start" fontSize="sm">
                      <Text as="span" color={lv.color} fontWeight={700} w="12px" textAlign="center" flexShrink={0} aria-hidden>
                        {lv.mark}
                      </Text>
                      <Box minW={0} flex={1}>
                        <Text>
                          <Box as="span" srOnly>
                            {lv.sr}:{' '}
                          </Box>
                          {c.label}
                        </Text>
                        {c.detail ? (
                          <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
                            {c.detail}
                          </Text>
                        ) : null}
                        <Flex gap={3} mt={1} flexWrap="wrap">
                          {c.level !== 'ok' ? (
                            <Button
                              size="xs"
                              variant="link"
                              color="accent.text"
                              onClick={() => {
                                onClose()
                                onFocusField(c.field, c.line)
                              }}
                            >
                              {c.line ? `${FIELD_LABEL[c.field]}, line ${c.line}` : `Edit ${FIELD_LABEL[c.field].toLowerCase()}`}
                            </Button>
                          ) : null}
                          {c.importUrl ? (
                            <Button
                              size="xs"
                              variant="link"
                              color="accent.text"
                              isLoading={importing === c.importUrl}
                              isDisabled={!!importing && importing !== c.importUrl}
                              onClick={() => void importImage(c)}
                            >
                              Import &amp; optimize
                            </Button>
                          ) : null}
                        </Flex>
                      </Box>
                    </Flex>
                  )
                })}
                {knownError ? (
                  <Text as="li" fontSize="xs" color="page.fg-secondary">
                    Internal links weren’t checked (couldn’t load the post list).
                  </Text>
                ) : null}
              </Stack>
            </Box>

            <Box>
              <Eyebrow mb={2}>Refreshes</Eyebrow>
              <Text fontSize="sm" color="page.fg-secondary">
                <Text as="span" fontFamily={MONO} color="page.fg">
                  /{collection}
                </Text>
                {detailPath ? (
                  <>
                    {', '}
                    <Text as="span" fontFamily={MONO} color="page.fg">
                      {detailPath}
                    </Text>
                  </>
                ) : null}
                {others ? ` and ${others} other ${collection === 'blog' ? 'post' : 'case study'} page${others === 1 ? '' : 's'} (related links)` : ''}
                {' '}update right after publishing.
              </Text>
            </Box>
          </Stack>
        </DrawerBody>
        <DrawerFooter gap={2} borderTop="1px solid" borderColor="page.border">
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Keep editing
          </Button>
          <Button size="sm" {...primaryButtonProps} onClick={() => void publish()} isDisabled={blocked} isLoading={publishing} loadingText="Publishing">
            Publish now
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
