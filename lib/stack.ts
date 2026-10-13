import fs from 'fs'
import path from 'path'

/**
 * The site's own tech stack, grouped and human-named — shared by
 * GET /api/stack, the /uses page and /colophon.
 *
 * Derived from package.json (so it never goes stale) but curated: only
 * packages that say something about how the site is built are listed, with
 * their display name and the major.minor of the version actually INSTALLED
 * (not the floor of the semver range in package.json). Tooling / type
 * packages are left out.
 *
 * Installed versions come from the build-time snapshot next.config.js
 * inlines as process.env.STACK_INSTALLED_VERSIONS — the standalone server
 * only ships the node_modules it traced, so build- and browser-only packages
 * (typescript, @tiptap/*, @dnd-kit/*) are absent when /uses regenerates at
 * runtime — and otherwise from node_modules/<pkg>/package.json.
 *
 * Node-only (reads the filesystem); computed once per process.
 */

export type StackItem = { name: string; version?: string }
export type StackGroup = { label: string; hint: string; items: StackItem[] }
export type Stack = { groups: StackGroup[]; packages: string[] }

// Packages whose own version says nothing about the product (an SDK for a service).
const NO_VERSION = new Set(['@aws-sdk/client-s3', 'gray-matter'])

const CATALOG: Array<{ label: string; hint: string; entries: Array<[pkg: string, name: string]> }> = [
  {
    label: 'Framework',
    hint: 'Rendering and language',
    entries: [
      ['next', 'Next.js'],
      ['react', 'React'],
      ['typescript', 'TypeScript'],
    ],
  },
  {
    label: 'Interface',
    hint: 'Components, motion and editors',
    entries: [
      ['@chakra-ui/react', 'Chakra UI'],
      ['framer-motion', 'Framer Motion'],
      ['@dnd-kit/core', 'dnd kit'],
      ['@tiptap/react', 'Tiptap'],
    ],
  },
  {
    label: 'Content',
    hint: 'Writing and publishing pipeline',
    entries: [
      // MDX is compiled on the server by unified + remark-mdx into a plain
      // hast tree (no client-side eval), with GitHub-flavoured Markdown.
      ['remark-mdx', 'MDX'],
      ['remark-gfm', 'GFM'],
      ['shiki', 'Shiki'],
      ['gray-matter', 'gray-matter'],
      ['sharp', 'sharp'],
      ['@vercel/og', 'OG images'],
    ],
  },
  {
    label: 'Data',
    hint: 'Storage and validation',
    entries: [
      ['better-sqlite3', 'SQLite'],
      ['@aws-sdk/client-s3', 'Cloudflare R2'],
      ['mongodb', 'MongoDB'],
    ],
  },
  {
    label: 'Platform',
    hint: 'Auth and mail',
    entries: [
      ['jose', 'JOSE (JWT)'],
      ['nodemailer', 'Nodemailer'],
    ],
  },
]

/** "^14.2.3" → "14.2"; undefined when no version can be read. */
export function shortVersion(range: unknown): string | undefined {
  const m = String(range || '').match(/(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}` : undefined
}

/** "15.5.27" → "15.5"; undefined for a range ("^18.2.0", "~5.4.5", "latest"), whose floor says nothing about what is installed. */
export function pinnedVersion(spec: unknown): string | undefined {
  return typeof spec === 'string' && /^\d+\.\d+\.\d+$/.test(spec.trim()) ? shortVersion(spec) : undefined
}

export type BuildStackOptions = {
  /** Installed version per package name (installedVersions()). */
  installed?: Readonly<Record<string, string>>
}

/**
 * Pure: the curated stack for a parsed package.json and a Node.js version
 * string. Each version is the installed one (`options.installed`), else the
 * exact version package.json pins, else none — never a range floor.
 */
export function buildStack(
  pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  nodeVersion: string,
  options: BuildStackOptions = {},
): Stack {
  const all: Record<string, string> = { ...(pkg?.devDependencies || {}), ...(pkg?.dependencies || {}) }
  const installed = options.installed || {}
  const groups: StackGroup[] = CATALOG.map((g) => {
    const entries = g.entries.filter(([name]) => Object.prototype.hasOwnProperty.call(all, name))
    return {
      label: g.label,
      hint: g.hint,
      items: entries.map(([name, display]) => {
        const version = NO_VERSION.has(name) ? undefined : (shortVersion(installed[name]) ?? pinnedVersion(all[name]))
        return version ? { name: display, version } : { name: display }
      }),
    }
  }).filter((g) => g.items.length > 0)
  const node = shortVersion(nodeVersion)
  groups.push({
    label: 'Infrastructure',
    hint: 'Where it runs',
    items: [{ name: 'Docker' }, node ? { name: 'Node.js', version: node } : { name: 'Node.js' }, { name: 'Cloudflare' }],
  })
  return { groups, packages: groups.flatMap((g) => g.items.map((i) => i.name)) }
}

const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

/** Every package the stack can list. */
export const STACK_PACKAGES: readonly string[] = CATALOG.flatMap((g) => g.entries.map(([name]) => name))

/**
 * Installed version of each of `names`: from `snapshot` (JSON of
 * `{ name: version }`, the build-time process.env.STACK_INSTALLED_VERSIONS)
 * when it has the package, else from `<root>/node_modules/<name>/package.json`.
 * Unknown packages are simply missing; never throws.
 */
export function installedVersions(
  names: readonly string[],
  snapshot: string | undefined = process.env.STACK_INSTALLED_VERSIONS,
  root: string = process.cwd(),
): Record<string, string> {
  let fromBuild: Record<string, unknown> = {}
  try {
    const parsed: unknown = snapshot ? JSON.parse(snapshot) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fromBuild = parsed as Record<string, unknown>
  } catch {
    fromBuild = {}
  }
  const out: Record<string, string> = {}
  for (const name of names) {
    if (!PACKAGE_NAME_RE.test(name)) continue
    const known = fromBuild[name]
    if (typeof known === 'string' && shortVersion(known)) {
      out[name] = known
      continue
    }
    try {
      const { version } = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf-8')) as { version?: unknown }
      if (typeof version === 'string' && shortVersion(version)) out[name] = version
    } catch {
      /* not installed here: no version for it */
    }
  }
  return out
}

let cached: Stack | null = null

/** The stack of this deployment; an empty stack when package.json cannot be read. */
export function readStack(): Stack {
  if (cached) return cached
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
    cached = buildStack(pkg, process.versions.node, { installed: installedVersions(STACK_PACKAGES) })
    return cached
  } catch {
    return { groups: [], packages: [] }
  }
}
