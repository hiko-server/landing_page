import React from 'react'
import {
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  SimpleGrid,
  Skeleton,
  Stack,
} from '@chakra-ui/react'
import dynamic from 'next/dynamic'
import { AdminDirtyProvider } from '../../../components/Admin/AdminDirtyContext'
import {
  AdminPageShell,
  BackLink,
  LoadErrorNotice,
  MONO,
  RevalidatedPaths,
  SaveButton,
  SaveStatus,
  SessionExpiredNotice,
  inputProps,
} from '../../../components/Admin/shell/ui'
import CoverImageField from '../../../components/Admin/shell/CoverImageField'
import { useMdxItemEditor } from '../../../components/Admin/shell/useMdxItemEditor'

// TipTap touches the DOM during init — client-side only.
const RichEditor = dynamic(() => import('../../../components/Admin/RichEditor'), {
  ssr: false,
  loading: () => <Skeleton h="500px" borderRadius="lg" />,
})

type Frontmatter = {
  title: string
  description: string
  date: string
  tags: string[]
  draft: boolean
  cover: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const EMPTY: Frontmatter = {
  title: '',
  description: '',
  date: todayISO(),
  tags: [],
  draft: true,
  cover: '',
}

const fromServer = (f: Record<string, any>): Frontmatter => ({
  title: String(f.title || ''),
  description: String(f.description || ''),
  date: String(f.date || todayISO()).slice(0, 10),
  tags: Array.isArray(f.tags) ? f.tags.map(String) : [],
  draft: Boolean(f.draft),
  cover: String(f.cover || ''),
})

const toServer = (fm: Frontmatter, tags: string[]) => ({
  title: fm.title,
  description: fm.description || undefined,
  date: fm.date,
  tags: tags.length ? tags : undefined,
  draft: fm.draft || undefined,
  cover: fm.cover || undefined,
})

function BlogEditor() {
  const ed = useMdxItemEditor<Frontmatter>({
    collection: 'blog',
    endpoint: '/api/admin/posts',
    noun: 'post',
    empty: EMPTY,
    listField: 'tags',
    fromServer,
    toServer,
  })
  const { fm, setFm } = ed
  const liveHref =
    ed.slugParam && !fm.draft && ed.loadState === 'ready' ? `/blog/${ed.slugParam}` : ''

  return (
    <AdminPageShell
      headTitle={ed.isNew ? 'Admin · New post' : `Admin · Edit ${ed.slugParam}`}
      eyebrow={`[admin] blog · ${ed.isNew ? 'new' : 'edit'}`}
      title={ed.isNew ? 'New post' : fm.title || ed.slugParam}
      status={<SaveStatus state={ed.saveState} />}
      actions={
        <>
          <BackLink href="/admin/blog">← All posts</BackLink>
          {liveHref ? (
            <Button
              as="a"
              href={liveHref}
              target="_blank"
              rel="noopener"
              size="sm"
              variant="ghost"
              color="page.fg-secondary"
            >
              View live ↗
            </Button>
          ) : null}
          <SaveButton onSave={ed.save} canSave={ed.canSave} saving={ed.saving} />
        </>
      }
    >
      <Stack spacing={4}>
        {ed.loadState === 'error' ? (
          <LoadErrorNotice what="this post" error={ed.loadError} onRetry={ed.retry} />
        ) : null}
        {ed.sessionExpired ? <SessionExpiredNotice returnPath="/admin/blog" keepEdits /> : null}
        {ed.revalidated.length ? <RevalidatedPaths paths={ed.revalidated} /> : null}

        {ed.loadState === 'loading' ? (
          <Stack spacing={4} aria-busy="true" aria-label="Loading post">
            <Skeleton h="40px" />
            <Skeleton h="40px" />
            <Skeleton h="420px" />
          </Stack>
        ) : ed.loadState === 'error' ? null : (
          <Stack spacing={4}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl isRequired>
                <FormLabel fontSize="13px">Slug</FormLabel>
                <Input
                  {...inputProps}
                  value={ed.slug}
                  placeholder="my-first-post"
                  onChange={(e) => ed.setSlug(e.target.value.trim().toLowerCase())}
                  isReadOnly={!ed.isNew}
                  fontFamily={MONO}
                  fontSize="14px"
                  autoComplete="off"
                  spellCheck={false}
                />
                <FormHelperText fontSize="xs" color="page.fg-secondary">
                  {ed.isNew
                    ? 'a–z, 0–9, - and _. Becomes /blog/<slug> and can’t be changed later.'
                    : `Published at /blog/${ed.slug}`}
                </FormHelperText>
              </FormControl>
              <FormControl isRequired>
                <FormLabel fontSize="13px">Date</FormLabel>
                <Input
                  {...inputProps}
                  type="date"
                  value={fm.date}
                  onChange={(e) => setFm({ ...fm, date: e.target.value })}
                />
              </FormControl>
            </SimpleGrid>

            <FormControl isRequired>
              <FormLabel fontSize="13px">Title</FormLabel>
              <Input
                {...inputProps}
                value={fm.title}
                onChange={(e) => setFm({ ...fm, title: e.target.value })}
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="13px">Description</FormLabel>
              <Input
                {...inputProps}
                value={fm.description}
                onChange={(e) => setFm({ ...fm, description: e.target.value })}
                placeholder="One-line summary for the index, RSS and link previews"
              />
            </FormControl>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} alignItems="end">
              <FormControl>
                <FormLabel fontSize="13px">Tags (comma-separated)</FormLabel>
                <Input
                  {...inputProps}
                  value={ed.listText}
                  onChange={(e) => ed.setListText(e.target.value)}
                  onBlur={ed.commitList}
                  placeholder="engineering, ml, notes"
                />
              </FormControl>
              <Flex pb={2}>
                <Checkbox
                  colorScheme="accent"
                  isChecked={fm.draft}
                  onChange={(e) => setFm({ ...fm, draft: e.target.checked })}
                >
                  Draft — hidden from the public list
                </Checkbox>
              </Flex>
            </SimpleGrid>

            <CoverImageField
              value={fm.cover}
              onChange={(cover) => setFm((f) => ({ ...f, cover }))}
            />

            <FormControl>
              <FormLabel fontSize="13px" id="blog-body-label">
                Body
              </FormLabel>
              <RichEditor
                value={ed.body}
                onChange={ed.setBody}
                minH="500px"
                labelledBy="blog-body-label"
                placeholder="Write in Markdown. Drag, drop or paste images. Use the MDX tab for JSX components."
              />
            </FormControl>
          </Stack>
        )}
      </Stack>
    </AdminPageShell>
  )
}

export default function AdminBlogEdit() {
  return (
    <AdminDirtyProvider>
      <BlogEditor />
    </AdminDirtyProvider>
  )
}
