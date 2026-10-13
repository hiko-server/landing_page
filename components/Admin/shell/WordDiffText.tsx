import React from 'react'
import { Box } from '@chakra-ui/react'
import type { WordSegment } from '../../../lib/wordDiff'

/**
 * One side of a word-level diff (lib/wordDiff): unchanged text as is, the
 * words that changed marked — removed words struck through on the removed
 * side, inserted words underlined on the inserted side — so the change never
 * relies on colour alone (WCAG 1.4.1). Each mark carries a visually hidden
 * "removed:" / "added:" cue for screen readers.
 */

const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

export default function WordDiffText({ segments, side }: { segments: readonly WordSegment[]; side: 'del' | 'add' }) {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === 'same' ? (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ) : (
          <Box
            key={i}
            as="mark"
            data-word-diff={s.kind}
            color="inherit"
            borderRadius="2px"
            px="1px"
            bg={side === 'del' ? 'rgba(239,68,68,0.32)' : 'rgba(34,197,94,0.32)'}
            textDecoration={side === 'del' ? 'line-through' : 'underline'}
            textDecorationThickness="1px"
            textUnderlineOffset="2px"
            sx={{ '@media (forced-colors: active)': { bg: 'Mark', color: 'MarkText' } }}
          >
            <Box as="span" sx={SR_ONLY}>
              {side === 'del' ? 'removed: ' : 'added: '}
            </Box>
            {s.text}
          </Box>
        ),
      )}
    </>
  )
}
