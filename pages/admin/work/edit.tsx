import React from 'react'
import {
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Select,
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

type Status = 'live' | 'case-study' | 'archived'

type Frontmatter = {
  title: string
  description: string
  role: string
  period: string
  tech: string[]
  status: Status
  featured: boolean
  link: string
  repo: string
  cover: string
}

const STATUSES: Status[] = ['case-study', 'live', 'archived']

const EMPTY: Frontmatter = {
  title: '',
  description: '',
  role: '',
  period: '',
  tech: [],
  status: 'case-study',
  featured: false,
  link: '',
  repo: '',
  cover: '',
}

const fromServer = (f: Record<string, any>): Frontmatter => ({
  title: String(f.title || ''),
  description: String(f.description || ''),
  role: String(f.role || ''),
  period: String(f.period || ''),
  tech: Array.isArray(f.tech) ? f.tech.map(String) : [],
  status: STATUSES.includes(f.status) ? f.status : 'case-study',
  featured: Boolean(f.featured),
  link: String(f.link || ''),
  repo: String(f.repo || ''),
  cover: String(f.cover || ''),
})

const toServer = (fm: Frontmatter, tech: string[]) => ({
  title: fm.title,
  description: fm.description || undefined,
  role: fm.role || undefined,
  period: fm.period || undefined,
  tech: tech.length ? tech : undefined,
  status: fm.status,
  featured: fm.featured || undefined,
  link: fm.link || undefined,
  repo: fm.repo || undefined,
  cover: fm.cover || undefined,
})

function WorkEditor() {
  const ed = useMdxItemEditor<Frontmatter>({
    collection: 'work',
    endpoint: '/api/admin/work',
    noun: 'case study',
    empty: EMPTY,
    listField: 'tech',
    fromServer,
    toServer,
  })
  const { fm, setFm } = ed
  const liveHref = ed.slugParam && ed.loadState === 'ready' ? `/work/${ed.slugParam}` : ''

  return (
    <AdminPageShell
      headTitle={ed.isNew ? 'Admin · New case study' : `Admin · Edit ${ed.slugParam}`}
      eyebrow={`[admin] work · ${ed.isNew ? 'new' : 'edit'}`}
      title={ed.isNew ? 'New case study' : fm.title || ed.slugParam}
      status={<SaveStatus state={ed.saveState} />}
      actions={
        <>
          <BackLink href="/admin/work">← All case studies</BackLink>
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
          <LoadErrorNotice what="this case study" error={ed.loadError} onRetry={ed.retry} />
        ) : null}
        {ed.sessionExpired ? <SessionExpiredNotice returnPath="/admin/work" keepEdits /> : null}
        {ed.revalidated.length ? <RevalidatedPaths paths={ed.revalidated} /> : null}

        {ed.loadState === 'loading' ? (
          <Stack spacing={4} aria-busy="true" aria-label="Loading case study">
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
                  placeholder="my-project"
                  onChange={(e) => ed.setSlug(e.target.value.trim().toLowerCase())}
                  isReadOnly={!ed.isNew}
                  fontFamily={MONO}
                  fontSize="14px"
                  autoComplete="off"
                  spellCheck={false}
                />
                <FormHelperText fontSize="xs" color="page.fg-secondary">
                  {ed.isNew
                    ? 'a–z, 0–9, - and _. Becomes /work/<slug> and can’t be changed later.'
                    : `Published at /work/${ed.slug}`}
                </FormHelperText>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="13px">Period</FormLabel>
                <Input
                  {...inputProps}
                  value={fm.period}
                  onChange={(e) => setFm({ ...fm, period: e.target.value })}
                  placeholder="2024 — Now"
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
                placeholder="One-line summary of the project"
              />
            </FormControl>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel fontSize="13px">Role</FormLabel>
                <Input
                  {...inputProps}
                  value={fm.role}
                  onChange={(e) => setFm({ ...fm, role: e.target.value })}
                  placeholder="Co-founder / Engineer"
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="13px">Status</FormLabel>
                <Select
                  {...inputProps}
                  value={fm.status}
                  onChange={(e) => setFm({ ...fm, status: e.target.value as Status })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel fontSize="13px">Tech (comma-separated)</FormLabel>
              <Input
                {...inputProps}
                value={ed.listText}
                onChange={(e) => ed.setListText(e.target.value)}
                onBlur={ed.commitList}
                placeholder="Next.js, FastAPI, MongoDB"
              />
            </FormControl>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel fontSize="13px">Live URL</FormLabel>
                <Input
                  {...inputProps}
                  type="url"
                  inputMode="url"
                  value={fm.link}
                  onChange={(e) => setFm({ ...fm, link: e.target.value })}
                  placeholder="https://…"
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="13px">Repo URL</FormLabel>
                <Input
                  {...inputProps}
                  type="url"
                  inputMode="url"
                  value={fm.repo}
                  onChange={(e) => setFm({ ...fm, repo: e.target.value })}
                  placeholder="https://github.com/…"
                />
              </FormControl>
            </SimpleGrid>

            <Checkbox
              colorScheme="accent"
              isChecked={fm.featured}
              onChange={(e) => setFm({ ...fm, featured: e.target.checked })}
            >
              Featured — highlighted in the /work index
            </Checkbox>

            <CoverImageField
              value={fm.cover}
              onChange={(cover) => setFm((f) => ({ ...f, cover }))}
            />

            <FormControl>
              <FormLabel fontSize="13px" id="work-body-label">
                Body
              </FormLabel>
              <RichEditor
                value={ed.body}
                onChange={ed.setBody}
                minH="500px"
                labelledBy="work-body-label"
                placeholder="Write in Markdown. Drag, drop or paste images. Use the MDX tab for JSX components."
              />
            </FormControl>
          </Stack>
        )}
      </Stack>
    </AdminPageShell>
  )
}

export default function AdminWorkEdit() {
  return (
    <AdminDirtyProvider>
      <WorkEditor />
    </AdminDirtyProvider>
  )
}
