/**
 * Content health center (Admin → System → Content): the report's shapes and
 * labels. Client-safe — no Node imports — so the admin panel can import it;
 * everything that reads the store or the network lives in the sibling
 * server modules (collect, linkRunner, apply).
 */

export const SEVERITIES = ['error', 'warning', 'notice'] as const
export type Severity = (typeof SEVERITIES)[number]

export const SEVERITY_LABEL: Record<Severity, { one: string; many: string }> = {
  error: { one: 'Error', many: 'Errors' },
  warning: { one: 'Warning', many: 'Warnings' },
  notice: { one: 'Notice', many: 'Notices' },
}

/** Every rule, in the order the panel lists them. */
export const HEALTH_CHECKS = [
  'broken-link',
  'redirect',
  'internal-link',
  'tracking',
  'image-missing',
  'remote-image',
  'image-srcset',
  'image-weight',
  'image-dimensions',
  'image-alt',
  'heading',
  'hard-break',
  'description',
  'mdx',
] as const
export type HealthCheck = (typeof HEALTH_CHECKS)[number]

export const CHECK_LABEL: Record<HealthCheck, string> = {
  'broken-link': 'Broken links',
  redirect: 'Moved links',
  'internal-link': 'Internal links',
  tracking: 'Tracking parameters',
  'image-missing': 'Missing images',
  'remote-image': 'Images hosted elsewhere',
  'image-srcset': 'Responsive image sizes',
  'image-weight': 'Heavy images',
  'image-dimensions': 'Image dimensions',
  'image-alt': 'Alt text',
  heading: 'Heading structure',
  'hard-break': 'Hard line breaks',
  description: 'Descriptions',
  mdx: 'MDX errors',
}

export function isHealthCheck(v: unknown): v is HealthCheck {
  return typeof v === 'string' && (HEALTH_CHECKS as readonly string[]).includes(v)
}

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)
}

export type HealthItemKind = 'post' | 'work' | 'page' | 'cv' | 'home'

export const ITEM_KIND_LABEL: Record<HealthItemKind, string> = {
  post: 'Post',
  work: 'Case study',
  page: 'Page',
  cv: 'CV',
  home: 'Home page',
}

/** A published piece of content the report covers. */
export type HealthItem = {
  /** 'blog/<slug>', 'work/<slug>', 'page/<name>', 'cv', 'home'. */
  key: string
  kind: HealthItemKind
  title: string
  /** Admin page that edits it. */
  editHref: string
  /** The public page. */
  publicHref: string
  /** Store version (row updated_at, ms) the report was computed from; fixes must match it. */
  version: number
}

export type HealthFixType =
  | 'strip-tracking'
  | 'use-new-url'
  | 'import-image'
  | 'generate-variants'
  | 'paragraph-breaks'
  | 'remove-backslash'
  | 'visible-breaks'

/** Button label of each fix, for the row and the bulk confirmation. */
export const FIX_LABEL: Record<HealthFixType, { button: string; summary: (n: number) => string }> =
  {
    'strip-tracking': {
      button: 'Strip tracking',
      summary: (n) => `Strip tracking parameters from ${n} link${n === 1 ? '' : 's'}`,
    },
    'use-new-url': {
      button: 'Use new address',
      summary: (n) => `Point ${n} moved link${n === 1 ? '' : 's'} at the new address`,
    },
    'import-image': {
      button: 'Import image',
      summary: (n) => `Import ${n} image${n === 1 ? '' : 's'} into the uploads`,
    },
    'generate-variants': {
      button: 'Generate sizes',
      summary: (n) => `Generate responsive sizes for ${n} image${n === 1 ? '' : 's'}`,
    },
    'paragraph-breaks': {
      button: 'Make paragraphs',
      summary: (n) =>
        `Turn empty line breaks into paragraph breaks in ${n} item${n === 1 ? '' : 's'}`,
    },
    'remove-backslash': {
      button: 'Remove “\\”',
      summary: (n) => `Remove ${n} stray backslash${n === 1 ? '' : 'es'}`,
    },
    'visible-breaks': {
      button: 'Make visible',
      summary: (n) => `Mark invisible line breaks with “\\” in ${n} item${n === 1 ? '' : 's'}`,
    },
  }

/** A one-click fix the server can apply safely (through the editor's save path). */
export type HealthFix = {
  type: HealthFixType
  /** What changes, shown under the issue ("→ https://…"). */
  to?: string
}

export type HealthIssue = {
  /** Stable across reports while the problem exists (check + item + what). */
  id: string
  check: HealthCheck
  severity: Severity
  /** HealthItem key. */
  item: string
  /** "Line 12", "Cover", "EN · Certifications › … › Credential URL". */
  where: string
  /** 1-based body line, when the issue is in an MDX body. */
  line?: number
  /** One short sentence: what is wrong. */
  message: string
  /** Why it matters and what to do. */
  detail: string
  /** The link or image the issue is about. */
  url?: string
  fix?: HealthFix
}

export type LinkTrigger = 'scheduled' | 'manual'

export type LinkRunInfo = {
  trigger: LinkTrigger
  startedAt: number
  finishedAt: number | null
  /** URLs requested in this run. */
  checked: number
  /** Not requested: checked recently enough, or over the per-run cap. */
  skipped: number
  /** The run hit its time budget or URL cap; the rest is checked next time. */
  partial: boolean
  error: string | null
}

export type UnverifiableLink = {
  url: string
  /** "LinkedIn answers automated requests with 999", "HTTP 403 (refused)", … */
  reason: string
  refs: Array<{ item: string; where: string }>
}

export type LinkHealth = {
  running: boolean
  progress: { done: number; total: number } | null
  lastRun: LinkRunInfo | null
  /** Next scheduled run (ms), null when the schedule is off or not started. */
  nextAt: number | null
  /** 0 = scheduled checks are off. */
  intervalHours: number
  /** External URLs the public content references (links and remote images). */
  total: number
  /** Of those, how many have a stored result. */
  checked: number
  broken: number
  moved: number
  unverifiable: UnverifiableLink[]
}

export type HealthCounts = {
  error: number
  warning: number
  notice: number
  /** Issues with a one-click fix. */
  fixable: number
  byCheck: Partial<Record<HealthCheck, number>>
}

export type HealthReport = {
  generatedAt: number
  items: Record<string, HealthItem>
  issues: HealthIssue[]
  counts: HealthCounts
  scanned: { items: number; links: number; images: number }
  links: LinkHealth
}

/** GET ?summary=1 — what the System → Health card shows. */
export type HealthSummary = {
  generatedAt: number
  counts: HealthCounts
  scanned: HealthReport['scanned']
  links: Omit<LinkHealth, 'unverifiable'> & { unverifiable: number }
}

export type FixRequest = { id: string; version?: number }

export type FixResultCode = 'VERSION_CONFLICT' | 'GONE' | 'DEFERRED' | 'FAILED' | 'NO_FIX'

export type FixResult = {
  id: string
  ok: boolean
  /** GONE with ok: the problem is no longer there (fixed elsewhere or by another fix). */
  code?: FixResultCode
  error?: string
}

export type FixResponse = {
  results: FixResult[]
  applied: number
  revalidated: string[]
  revalidateFailed?: string[]
}

export function countIssues(issues: readonly HealthIssue[]): HealthCounts {
  const counts: HealthCounts = { error: 0, warning: 0, notice: 0, fixable: 0, byCheck: {} }
  for (const i of issues) {
    counts[i.severity]++
    if (i.fix) counts.fixable++
    counts.byCheck[i.check] = (counts.byCheck[i.check] || 0) + 1
  }
  return counts
}
