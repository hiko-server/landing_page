import { Box, Stack } from '@chakra-ui/react'
import { AdminPageShell, BackLink, SectionLabel } from '../../components/Admin/shell/ui'
import TagManager from '../../components/Admin/tags/TagManager'
import ContentExportCard from '../../components/Admin/tags/ContentExportCard'

/**
 * Admin → Tags & export (H16): rename and merge post tags and case-study
 * tech across every item, and download all content as a .zip.
 *   /admin/tags          post tags
 *   /admin/tags?c=work   case-study tech
 */
export default function AdminTags() {
  return (
    <AdminPageShell headTitle="Admin · Tags & export" eyebrow="[admin] content" title="Tags & export" actions={<BackLink href="/admin">← Admin</BackLink>}>
      <Stack spacing={0}>
        <SectionLabel
          index={1}
          id="tags-heading"
          title="Tags"
          hint="One tag can be written several ways (“Edge AI”, “edge ai”): the site treats them as one, but they show differently. Rename, unify or merge them here — every post or case study that uses them is updated, with a history snapshot first."
        />
        <Box as="section" aria-labelledby="tags-heading">
          <TagManager />
        </Box>
        <SectionLabel index={2} id="export-heading" title="Export" hint="A portable copy of your content — Markdown with frontmatter and JSON — for your own archive or a move to another platform." />
        <Box as="section" aria-labelledby="export-heading">
          <ContentExportCard />
        </Box>
      </Stack>
    </AdminPageShell>
  )
}
