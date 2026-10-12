import React from 'react'
import { Badge, HStack, Text } from '@chakra-ui/react'
import CollectionIndex, { type Column } from '../../../components/Admin/shell/CollectionIndex'

const STATUS_COLOR: Record<string, string> = {
  live: 'green',
  archived: 'gray',
  'case-study': 'accent',
}

const COLUMNS: Column[] = [
  {
    header: 'Period',
    cell: (it) => it.frontmatter.period || '—',
    hideBelow: 'sm',
  },
  {
    header: 'Tech',
    cell: (it) => (
      <Text as="span" fontSize="12px" color="page.fg-secondary">
        {Array.isArray(it.frontmatter.tech) && it.frontmatter.tech.length
          ? it.frontmatter.tech.slice(0, 3).join(' · ')
          : '—'}
      </Text>
    ),
    hideBelow: 'lg',
  },
  {
    header: 'Status',
    cell: (it) => {
      const status =
        typeof it.frontmatter.status === 'string' ? it.frontmatter.status : 'case-study'
      return (
        <HStack spacing={1.5}>
          <Badge colorScheme={STATUS_COLOR[status] || 'gray'} variant="subtle" fontSize="10px">
            {status}
          </Badge>
          {it.frontmatter.featured ? (
            <Badge variant="outline" colorScheme="accent" fontSize="10px">
              featured
            </Badge>
          ) : null}
        </HStack>
      )
    },
  },
]

export default function AdminWorkIndex() {
  return (
    <CollectionIndex
      collection="work"
      endpoint="/api/admin/work"
      title="Case studies"
      noun="case study"
      nounPlural="case studies"
      newLabel="New case study"
      columns={COLUMNS}
    />
  )
}
