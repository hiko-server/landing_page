import { Badge, Text } from '@chakra-ui/react'
import CollectionIndex, { type Column } from '../../../components/Admin/shell/CollectionIndex'
import { MONO } from '../../../components/Admin/shell/ui'

const COLUMNS: Column[] = [
  {
    header: 'Date',
    cell: (it) => (
      <Text as="span" fontFamily={MONO} fontSize="12px">
        {it.frontmatter.date ? String(it.frontmatter.date).slice(0, 10) : '—'}
      </Text>
    ),
    hideBelow: 'sm',
  },
  {
    header: 'Tags',
    cell: (it) => (
      <Text as="span" fontSize="12px" color="page.fg-secondary">
        {Array.isArray(it.frontmatter.tags) && it.frontmatter.tags.length
          ? it.frontmatter.tags.slice(0, 3).join(' · ')
          : '—'}
      </Text>
    ),
    hideBelow: 'lg',
  },
  {
    header: 'Status',
    cell: (it) =>
      it.frontmatter.draft ? (
        <Badge colorScheme="yellow" variant="subtle" fontSize="10px">
          draft
        </Badge>
      ) : (
        <Badge colorScheme="green" variant="subtle" fontSize="10px">
          published
        </Badge>
      ),
  },
]

export default function AdminBlogIndex() {
  return (
    <CollectionIndex
      collection="blog"
      endpoint="/api/admin/posts"
      title="Posts"
      noun="post"
      nounPlural="posts"
      newLabel="New post"
      columns={COLUMNS}
    />
  )
}
