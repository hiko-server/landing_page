import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/stack → the site's own tech stack, grouped and human-named.
 *
 * Derived from package.json (so it never goes stale) but curated: only
 * packages that say something about how the site is built are listed, with
 * their display name and major.minor version. Tooling / type packages are
 * left out. Computed once per process.
 */

type Item = { name: string; version?: string }
type Group = { label: string; items: Item[] }

// Packages whose own version says nothing about the product (an SDK for a service).
const NO_VERSION = new Set(['@aws-sdk/client-s3', 'gray-matter'])

const CATALOG: Array<{ label: string; entries: Array<[pkg: string, name: string]> }> = [
  {
    label: 'Framework',
    entries: [
      ['next', 'Next.js'],
      ['react', 'React'],
      ['typescript', 'TypeScript'],
    ],
  },
  {
    label: 'Interface',
    entries: [
      ['@chakra-ui/react', 'Chakra UI'],
      ['framer-motion', 'Framer Motion'],
      ['@dnd-kit/core', 'dnd kit'],
      ['@tiptap/react', 'Tiptap'],
    ],
  },
  {
    label: 'Content',
    entries: [
      ['next-mdx-remote', 'MDX'],
      ['shiki', 'Shiki'],
      ['gray-matter', 'gray-matter'],
      ['@vercel/og', 'OG images'],
    ],
  },
  {
    label: 'Data',
    entries: [
      ['better-sqlite3', 'SQLite'],
      ['@aws-sdk/client-s3', 'Cloudflare R2'],
      ['mongodb', 'MongoDB'],
      ['zod', 'Zod'],
    ],
  },
  {
    label: 'Platform',
    entries: [
      ['@sentry/nextjs', 'Sentry'],
      ['jose', 'JOSE (JWT)'],
      ['nodemailer', 'Nodemailer'],
    ],
  },
]

let cached: { groups: Group[]; packages: string[] } | null = null

function shortVersion(range: unknown): string | undefined {
  const m = String(range || '').match(/(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}` : undefined
}

function compute() {
  const json = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
  const all: Record<string, string> = { ...(json.devDependencies || {}), ...(json.dependencies || {}) }
  const groups: Group[] = CATALOG.map((g) => ({
    label: g.label,
    items: g.entries
      .filter(([pkg]) => pkg in all)
      .map(([pkg, name]) => ({ name, version: NO_VERSION.has(pkg) ? undefined : shortVersion(all[pkg]) })),
  })).filter((g) => g.items.length > 0)
  groups.push({ label: 'Infrastructure', items: [{ name: 'Docker' }, { name: 'Node.js', version: process.versions.node.split('.').slice(0, 2).join('.') }, { name: 'Cloudflare' }] })
  return { groups, packages: groups.flatMap((g) => g.items.map((i) => i.name)) }
}

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!cached) cached = compute()
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400')
    return res.status(200).json(cached)
  } catch {
    return res.status(200).json({ groups: [], packages: [] })
  }
}
