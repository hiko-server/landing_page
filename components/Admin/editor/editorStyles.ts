import { MONO } from '../shell/ui'

/**
 * Styles of the visual editor's blocks (RichEditor spreads them into the
 * editing surface's `sx`): figures, videos, callouts, tables, MDX islands,
 * task boxes, the drop cursor and the block handle's gutter. They follow
 * the site's own rendering (components/MDX) closely enough that the editor
 * reads like the page: a callout is tinted and ruled in its colour, a
 * table has the article's header style, a figure's caption is the mono
 * caption, wide and full figures break out of the text column.
 *
 * Wide editors (≥ 760 px, a container query on the editing surface) set the
 * text in a 680 px column like the article's, so the widths read true.
 */

const accentOutline = { outline: '2px solid var(--accent)', outlineOffset: '3px' }

export const editorNodeSx = {
  '--gutter-l': { base: '36px', md: '40px' },
  '--gutter-r': { base: '16px', md: '24px' },
  containerType: 'inline-size',

  // ── The text column and figure widths ──────────────────────────────────
  '@container (min-width: 760px)': {
    '.tt-prose > *': { maxWidth: '680px', marginInline: 'auto' },
    '.tt-prose > [data-figure-width="wide"]': { maxWidth: 'min(100%, 1000px)' },
    '.tt-prose > [data-figure-width="full"]': { maxWidth: 'none' },
  },
  '.tt-prose > [data-figure-width="wide"]': { marginInline: { base: '-8px', md: '-16px' } },
  '.tt-prose > [data-figure-width="full"]': {
    marginLeft: 'calc(-1 * var(--gutter-l))',
    marginRight: 'calc(-1 * var(--gutter-r))',
    '.tt-figure-frame': { borderRadius: 0, borderInlineWidth: 0 },
  },

  // ── Figures ────────────────────────────────────────────────────────────
  '.tt-figure': { my: 6, mx: 0 },
  '.tt-figure-frame': {
    position: 'relative',
    borderRadius: 'lg',
    border: '1px solid',
    borderColor: 'page.border',
    bg: 'page.bg-elevated',
    overflow: 'hidden',
    lineHeight: 0,
    '& > img': { display: 'block', maxWidth: '100%', width: 'auto', height: 'auto', maxHeight: 'min(70vh, 40rem)', mx: 'auto' },
  },
  '.tt-figure[data-selected] .tt-figure-frame': accentOutline,
  // Hidden (and out of the accessibility tree) until the figure is selected or focused.
  '.tt-figure-tools': {
    opacity: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
    transform: 'translateY(-2px)',
    transition: 'opacity 120ms ease, transform 120ms ease, visibility 0s linear 120ms',
    lineHeight: 'normal',
    '&[data-visible]': { opacity: 1, visibility: 'visible', pointerEvents: 'auto', transform: 'none', transition: 'opacity 120ms ease, transform 120ms ease' },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none', transform: 'none' },
  },
  '.tt-figure-badge': {
    position: 'absolute',
    bottom: 2,
    left: 2,
    px: 1.5,
    py: 0.5,
    borderRadius: 'sm',
    bg: 'rgba(0,0,0,0.62)',
    color: 'white',
    fontFamily: MONO,
    fontSize: '10px',
    lineHeight: '14px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
  },
  '.tt-figure-caption': {
    display: 'block',
    borderRadius: 'sm',
    _hover: { bg: 'page.bg-overlay' },
    w: '100%',
    // A 24px target (WCAG 2.2 SC 2.5.8): the editable text around it is a target too.
    minH: '24px',
    mt: 2,
    px: 1,
    textAlign: 'center',
    fontFamily: MONO,
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'page.fg-secondary',
    _placeholder: { color: 'page.fg-subtle' },
    _focusVisible: { outline: '2px solid var(--accent-ring)', outlineOffset: '2px', borderRadius: 'sm' },
  },

  // ── Inline images (in a line of text, or a row of images: a gallery) ──
  '.tt-prose img.tt-inline-image': {
    display: 'inline-block',
    maxHeight: '8rem',
    maxWidth: '100%',
    width: 'auto',
    verticalAlign: 'middle',
    borderRadius: 'md',
    border: '1px solid',
    borderColor: 'page.border',
    mx: 0.5,
    my: 1,
  },
  '.tt-prose img.tt-inline-image.ProseMirror-selectednode': accentOutline,

  // ── Videos ─────────────────────────────────────────────────────────────
  '.tt-video': { my: 6 },
  '.tt-video[data-selected] .tt-video-frame': accentOutline,
  '.tt-video-title': {
    textAlign: 'center',
    minH: '24px',
    borderRadius: 'sm',
    _hover: { bg: 'page.bg-overlay' },
    fontSize: '14px',
    fontWeight: 500,
    color: 'page.fg',
    _placeholder: { color: 'page.fg-subtle', fontWeight: 400 },
    _focusVisible: { outline: '2px solid var(--accent-ring)', outlineOffset: '2px', borderRadius: 'sm' },
  },

  // ── Callouts (components/MDX/Callout) ─────────────────────────────────
  '.tt-callout': {
    '--callout-violet': '#6d28d9',
    '--callout-ink': 'var(--callout-ink-light)',
    my: 5,
    pl: { base: 4, sm: 5 },
    pr: { base: 3, sm: 4 },
    pt: 2,
    pb: 3,
    borderLeft: '3px solid',
    borderLeftColor: 'var(--callout-color)',
    borderRadius: '0 var(--chakra-radii-lg) var(--chakra-radii-lg) 0',
    background: 'color-mix(in srgb, var(--callout-color) 7%, var(--chakra-colors-page-bg))',
    '@media (forced-colors: active)': { border: '1px solid CanvasText', borderLeftWidth: '3px' },
  },
  '.chakra-ui-dark & .tt-callout, [data-theme="dark"] & .tt-callout': { '--callout-violet': '#c4b5fd', '--callout-ink': 'var(--callout-color)' },
  '.tt-callout-body > :first-of-type': { mt: 0 },
  '.tt-callout-body > :last-child': { mb: 0 },

  // ── Tables (the article's table style) ─────────────────────────────────
  '.tt-table-wrap': { overflowX: 'auto', my: 4 },
  '.tt-table': {
    w: '100%',
    borderCollapse: 'collapse',
    fontSize: '15px',
    'th, td': {
      position: 'relative',
      borderBottom: '1px solid',
      borderColor: 'page.border',
      px: 3,
      py: 2,
      textAlign: 'left',
      verticalAlign: 'top',
      minW: '4em',
    },
    th: {
      fontFamily: MONO,
      fontSize: '12px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'page.fg',
      borderBottomColor: 'page.border-strong',
    },
    '[data-align="center"]': { textAlign: 'center' },
    '[data-align="right"]': { textAlign: 'right' },
    '.selectedCell::after': { content: '""', position: 'absolute', inset: 0, bg: 'var(--accent-soft)', pointerEvents: 'none' },
  },
  '.tt-prose.ProseMirror-focused .tt-table td:focus-within, .tt-prose.ProseMirror-focused .tt-table th:focus-within': { bg: 'page.bg-overlay' },

  // ── MDX islands ───────────────────────────────────────────────────────
  '.tt-mdx-block': {
    my: 4,
    border: '1px dashed',
    borderColor: 'page.border-strong',
    borderRadius: 'md',
    bg: 'page.bg-elevated',
  },
  '.tt-mdx-block[data-selected]': accentOutline,
  '.tt-mdx-block[data-kind="comment"] .tt-mdx-source': { fontStyle: 'italic' },
  '.tt-mdx-inline > code': {
    bg: 'page.bg-overlay',
    border: '1px dashed',
    borderColor: 'page.border-strong',
    borderRadius: 'sm',
    px: 1,
    color: 'page.fg-secondary',
    cursor: 'default',
  },
  '.tt-mdx-inline[data-selected] > code': { outline: '2px solid var(--accent)', outlineOffset: '1px' },

  // ── Task boxes (GFM `- [ ]` / `- [x]`; click or ⌘↵ toggles) ───────────
  '.tt-prose li[data-checked]': { listStyleType: 'none', position: 'relative' },
  '.tt-prose li[data-checked]::before': {
    content: '""',
    position: 'absolute',
    left: '-1.45em',
    top: '0.42em',
    w: '0.95em',
    h: '0.95em',
    border: '1.5px solid var(--control-border, currentColor)',
    borderRadius: '3px',
    cursor: 'pointer',
  },
  '.tt-prose li[data-checked="true"]::before': {
    bg: 'accent.solid',
    borderColor: 'accent.solid',
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3.5 8.5 3 3 6-7'/%3E%3C/svg%3E\")",
    backgroundSize: '100% 100%',
  },
  '.tt-prose li[data-checked="true"] > p': { color: 'page.fg-secondary' },

  // ── Selection, drop cursor, the block handle's gutter ─────────────────
  // A node or cell selection (a figure, a video, an island, a callout,
  // table cells) hides the native highlight: ProseMirror clears its
  // background, but the site's ::selection also paints the text white, so a
  // selected caption, title or island vanished on paper. The text keeps its
  // own colour instead — currentColor, not inherit: a highlight pseudo
  // inherits from its parent's ::selection, which is the white one.
  '.tt-prose.ProseMirror-hideselection *::selection': { color: 'currentColor', background: 'transparent' },
  '.tt-prose .ProseMirror-selectednode:not(.react-renderer)': accentOutline,
  '.tt-prose .ProseMirror-gapcursor:after': { borderTopColor: 'page.fg' },
  '.tt-dropcursor': { bg: 'var(--accent)', borderRadius: 'full' },
  '@media (forced-colors: active)': {
    '.tt-figure[data-selected] .tt-figure-frame, .tt-video[data-selected] .tt-video-frame, .tt-mdx-block[data-selected]': { outline: '2px solid Highlight' },
  },
} as const
