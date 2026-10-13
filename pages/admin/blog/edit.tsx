import React from 'react'
import { FormControl, FormHelperText, FormLabel, Input, SimpleGrid, Stack } from '@chakra-ui/react'
import { AdminDirtyProvider } from '../../../components/Admin/AdminDirtyContext'
import { MONO, inputProps } from '../../../components/Admin/shell/ui'
import CoverImageField from '../../../components/Admin/shell/CoverImageField'
import { useMdxItemEditor } from '../../../components/Admin/shell/useMdxItemEditor'
import MdxItemEditorFrame from '../../../components/Admin/editor/MdxItemEditorFrame'
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

  return (
    <MdxItemEditorFrame
      ed={ed}
      collection="blog"
      noun="post"
      backHref="/admin/blog"
      backLabel="← All posts"
      newTitle="New post"
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
            <FormControl isRequired>
              <FormLabel fontSize="13px" htmlFor="item-slug">
                Slug
              </FormLabel>
              <Input
                {...inputProps}
                id="item-slug"
                value={ed.slug}
                placeholder="my-first-post"
                onChange={(e) => ed.setSlug(e.target.value.trim().toLowerCase())}
                isReadOnly={!ed.isNew}
                fontFamily={MONO}
                fontSize="14px"
                autoComplete="off"
                spellCheck={false}
              />
              <FormHelperText fontSize="xs" color={ed.slugHint ? 'orange.400' : 'page.fg-secondary'}>
                {ed.slugHint
                  ? `${ed.slugHint} — the title has no English words to build one from.`
                  : ed.isNew
                    ? 'Follows the title until you edit it. a–z, 0–9, - and _; becomes /blog/<slug> and can’t be changed later.'
                    : `Published at /blog/${ed.slug}`}
              </FormHelperText>
            </FormControl>
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

          <CoverImageField inputId="item-cover" value={fm.cover} onChange={(cover) => setFm((f) => ({ ...f, cover }))} />
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
