import { useMemo } from 'react'
import { Box } from '@chakra-ui/react'
import { collapseContext, type DiffLine } from './textDiff'
import { intralineHighlights, type WordSegment } from '../../../lib/wordDiff'
import WordDiffText from './WordDiffText'
import { MONO } from './ui'

/**
 * Unified line diff (components/Admin/shell/textDiff) with word-level
 * highlights: a removed line followed by its edited version shows exactly
 * which words changed (lib/wordDiff, Chinese segmented into words), the rest
 * of the line stays plain. Unchanged lines beyond `context` collapse into a
 * "⋯ n unchanged lines" row.
 */
export default function LineDiffView({ lines, context = 3 }: { lines: DiffLine[]; context?: number }) {
  const { rows, words } = useMemo(() => {
    const highlights = intralineHighlights(lines)
    const map = new Map<DiffLine, WordSegment[]>()
    lines.forEach((l, i) => {
      const h = highlights[i]
      if (h) map.set(l, h)
    })
    return { rows: collapseContext(lines, context), words: map }
  }, [lines, context])

  return (
    <Box
      as="pre"
      fontFamily={MONO}
      fontSize="12px"
      lineHeight={1.55}
      border="1px solid"
      borderColor="page.border"
      borderRadius="md"
      bg="page.bg"
      overflowX="auto"
      py={1}
      m={0}
      data-testid="line-diff"
    >
      {rows.map((r, i) => {
        if (r.type === 'skip') {
          return (
            <Box key={i} px={3} py={0.5} color="page.muted" bg="page.bg-elevated" fontStyle="italic">
              ⋯ {r.count} unchanged line{r.count === 1 ? '' : 's'}
            </Box>
          )
        }
        const line = r.line
        if (line.kind === 'same') {
          return (
            <Box key={i} px={3} color="page.fg-secondary" whiteSpace="pre-wrap" wordBreak="break-word">
              {'  '}
              {line.text}
            </Box>
          )
        }
        const segments = words.get(line)
        const add = line.kind === 'add'
        return (
          <Box
            as={add ? 'ins' : 'del'}
            key={i}
            display="block"
            px={3}
            textDecoration="none"
            bg={add ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}
            color="page.fg"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
          >
            {add ? '+ ' : '− '}
            {segments ? <WordDiffText segments={segments} side={add ? 'add' : 'del'} /> : line.text}
          </Box>
        )
      })}
    </Box>
  )
}
