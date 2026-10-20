import { useEffect, useMemo, useState } from 'react'
import { FormControl, FormHelperText, FormLabel, Input, Select, SimpleGrid, Stack } from '@chakra-ui/react'
import { AdminDirtyProvider } from '../../../components/Admin/AdminDirtyContext'
import { inputProps, warnTextProps } from '../../../components/Admin/shell/ui'
import CoverImageField, { type CoverSize } from '../../../components/Admin/shell/CoverImageField'
import { useMdxItemEditor } from '../../../components/Admin/shell/useMdxItemEditor'
import TranslationField from '../../../components/Admin/shell/TranslationField'
import MdxItemEditorFrame from '../../../components/Admin/editor/MdxItemEditorFrame'
import SlugField from '../../../components/Admin/editor/SlugField'
import { DESCRIPTION_MAX, TITLE_MAX } from '../../../components/Admin/shell/publishChecks'
import { BLOG_EMPTY, blogFromServer, blogToServer, type BlogFrontmatter } from '../../../components/Admin/shell/itemFrontmatter'

function BlogEditor() {
  const ed = useMdxItemEditor<BlogFrontmatter>({
    collection: 'blog',
    endpoint: '/api/admin/posts',
    noun: 'post',
    empty: BLOG_EMPTY,
    listField: 'tags',
    fromServer: blogFromServer,
    toServer: blogToServer,
  })
  const { fm, setFm } = ed
  const [coverSize, setCoverSize] = useState<CoverSize | null>(null)
  const publishExtra = useMemo(() => ({ coverWidth: coverSize?.width ?? null }), [coverSize])

  // Case studies the post can belong to (drafts included, so a pair can be prepared together).
  const [studies, setStudies] = useState<Array<{ slug: string; title: string }> | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/work', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: Array<{ slug: string; frontmatter?: { title?: unknown } }> } | null) => {
        if (!alive || !data) return
        setStudies(
          (data.items || []).map((i) => ({
            slug: i.slug,
            title: typeof i.frontmatter?.title === 'string' && i.frontmatter.title.trim() ? i.frontmatter.title : i.slug,
          })),
        )
      })
      .catch(() => {
        if (alive) setStudies([])
      })
    return () => {
      alive = false
    }
  }, [])
  const unknownProject = !!fm.project && !!studies && !studies.some((s) => s.slug === fm.project)

  return (
    <MdxItemEditorFrame
      ed={ed}
      collection="blog"
      noun="post"
      backHref="/admin/blog"
      backLabel="← All posts"
      newTitle="New post"
      publishExtra={publishExtra}
      fields={
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel fontSize="13px" htmlFor="item-title">
              Title
            </FormLabel>
            <Input {...inputProps} id="item-title" value={fm.title} onChange={(e) => setFm({ ...fm, title: e.target.value })} />
            <FormHelperText fontSize="xs" color={fm.title.length > TITLE_MAX ? 'orange.400' : 'page.fg-secondary'} className="tnum">
              {fm.title.length}/{TITLE_MAX}
            </FormHelperText>
          </FormControl>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <SlugField ed={ed} collection="blog" placeholder="my-first-post" />
            <FormControl isRequired>
              <FormLabel fontSize="13px" htmlFor="item-date">
                Date
              </FormLabel>
              <Input {...inputProps} id="item-date" type="date" value={fm.date} onChange={(e) => setFm({ ...fm, date: e.target.value })} />
            </FormControl>
          </SimpleGrid>

          <FormControl>
            <FormLabel fontSize="13px" htmlFor="item-description">
              Description
            </FormLabel>
            <Input
              {...inputProps}
              id="item-description"
              value={fm.description}
              onChange={(e) => setFm({ ...fm, description: e.target.value })}
              placeholder="One-line summary for the index, RSS and link previews"
            />
            <FormHelperText fontSize="xs" color={fm.description.length > DESCRIPTION_MAX ? 'orange.400' : 'page.fg-secondary'} className="tnum">
              {fm.description.length}/{DESCRIPTION_MAX} · 50–160 reads best in previews
            </FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel fontSize="13px" htmlFor="item-tags">
              Tags (comma-separated)
            </FormLabel>
            <Input
              {...inputProps}
              id="item-tags"
              value={ed.listText}
              onChange={(e) => ed.setListText(e.target.value)}
              onBlur={ed.commitList}
              placeholder="engineering, ml, notes"
            />
          </FormControl>

          <FormControl>
            <FormLabel fontSize="13px" htmlFor="item-project">
              Case study
            </FormLabel>
            <Select {...inputProps} id="item-project" value={fm.project} onChange={(e) => setFm({ ...fm, project: e.target.value })}>
              <option value="">None</option>
              {(studies || []).map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                </option>
              ))}
              {unknownProject ? <option value={fm.project}>{fm.project} (not found)</option> : null}
            </Select>
            <FormHelperText fontSize="xs" {...(unknownProject ? warnTextProps : { color: 'page.fg-secondary' })}>
              {unknownProject
                ? 'No case study has this slug any more — pick another or None.'
                : 'Links the post and the case study both ways: the post names it, the case study lists the post.'}
            </FormHelperText>
          </FormControl>

          <CoverImageField
            inputId="item-cover"
            value={fm.cover}
            onChange={(cover) => setFm((f) => ({ ...f, cover }))}
            alt={fm.coverAlt}
            onAltChange={(coverAlt) => setFm((f) => ({ ...f, coverAlt }))}
            onMeasure={setCoverSize}
          />

          <TranslationField ed={ed} collection="blog" />
        </Stack>
      }
    />
  )
}

export default function AdminBlogEdit() {
  return (
    <AdminDirtyProvider>
      <BlogEditor />
    </AdminDirtyProvider>
  )
}
