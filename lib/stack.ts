import fs from 'fs'
import path from 'path'

/**
 * The site's own tech stack, grouped and human-named — shared by
 * GET /api/stack, the /uses page and /colophon.
 *
 * Derived from package.json (so it never goes stale) but curated: only
 * packages that say something about how the site is built are listed, with
 * their display name and major.minor version. Tooling / type packages are
 * left out. Node-only (reads the filesystem); computed once per process.
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
    hint: 'Monitoring, auth and mail',
    entries: [
      ['@sentry/nextjs', 'Sentry'],
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

/** Pure: the curated stack for a parsed package.json and a Node.js version string. */
export function buildStack(pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }, nodeVersion: string): Stack {
  const all: Record<string, string> = { ...(pkg?.devDependencies || {}), ...(pkg?.dependencies || {}) }
  const groups: StackGroup[] = CATALOG.map((g) => ({
    label: g.label,
    hint: g.hint,
    items: g.entries
      .filter(([name]) => Object.prototype.hasOwnProperty.call(all, name))
      .map(([name, display]) => {
        const version = NO_VERSION.has(name) ? undefined : shortVersion(all[name])
        return version ? { name: display, version } : { name: display }
      }),
  })).filter((g) => g.items.length > 0)
  const node = shortVersion(nodeVersion)
  groups.push({
    label: 'Infrastructure',
    hint: 'Where it runs',
    items: [{ name: 'Docker' }, node ? { name: 'Node.js', version: node } : { name: 'Node.js' }, { name: 'Cloudflare' }],
  })
  return { groups, packages: groups.flatMap((g) => g.items.map((i) => i.name)) }
}

let cached: Stack | null = null

/** The stack of this deployment; an empty stack when package.json cannot be read. */
export function readStack(): Stack {
  if (cached) return cached
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
    cached = buildStack(pkg, process.versions.node)
    return cached
  } catch {
    return { groups: [], packages: [] }
  }
}
