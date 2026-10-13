/**
 * YouTube / Vimeo links → a video reference, and the URLs built from one.
 * Pure and client-safe: used by the compiler (a video link alone in its
 * paragraph becomes a click-to-load player, lib/rehype/autoEmbed.ts), the
 * poster import (lib/videoPoster.ts), the facade (components/MDX/VideoEmbed)
 * and the editor's "/video" command.
 *
 * Recognised (https or http, with or without www. / m.):
 *
 *   youtube.com/watch?v=<id>       youtu.be/<id>        youtube.com/shorts/<id>
 *   youtube.com/live/<id>          youtube.com/embed/<id>
 *   youtube-nocookie.com/embed/<id>
 *   vimeo.com/<id>                 vimeo.com/<id>/<hash> (unlisted)
 *   vimeo.com/channels/<c>/<id>    vimeo.com/groups/<g>/videos/<id>
 *   player.vimeo.com/video/<id>?h=<hash>
 *
 * A start time is kept: YouTube `t` / `start` ("90", "90s", "1m30s"),
 * Vimeo `#t=1m30s`. Everything else in the URL is ignored, so a player URL
 * built from a reference only ever carries the id, the unlisted hash, the
 * start time and the fixed player options below.
 */

export type VideoProvider = 'youtube' | 'vimeo'

export type VideoRef =
  | { provider: 'youtube'; id: string; start?: number }
  | { provider: 'vimeo'; id: string; hash?: string; start?: number }

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = { youtube: 'YouTube', vimeo: 'Vimeo' }

/** The host the player loads from once the visitor presses play (both are in the CSP frame-src). */
export const VIDEO_PLAYER_HOST: Record<VideoProvider, string> = { youtube: 'youtube-nocookie.com', vimeo: 'player.vimeo.com' }

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
export const VIMEO_ID_RE = /^\d{1,12}$/
const VIMEO_HASH_RE = /^[0-9a-f]{6,24}$/i
/** Longest start offset kept (24 h): anything larger is not a real timestamp. */
const MAX_START = 24 * 3600

/** Seconds of a start-time value: "90", "90s", "1m30s", "1h2m3s"; undefined when it is not one. */
export function parseStartTime(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  if (!v) return undefined
  let seconds: number
  if (/^\d{1,6}$/.test(v)) seconds = Number(v)
  else {
    const m = /^(?:(\d{1,2})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(v)
    if (!m || (!m[1] && !m[2] && !m[3])) return undefined
    seconds = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
  }
  return seconds > 0 && seconds <= MAX_START ? seconds : undefined
}

function parseUrl(input: string): URL | null {
  try {
    const u = new URL(input)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

const bareHost = (u: URL) => u.hostname.toLowerCase().replace(/^(?:www\.|m\.|music\.)/, '')

function youtubeRef(u: URL): VideoRef | null {
  const host = bareHost(u)
  let id: string | null = null
  if (host === 'youtu.be') id = u.pathname.split('/')[1] || null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch' && host === 'youtube.com') id = u.searchParams.get('v')
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)\/?$/.exec(u.pathname)
      id = m ? m[1] : null
    }
  }
  if (!id || !YOUTUBE_ID_RE.test(id)) return null
  const start = parseStartTime(u.searchParams.get('t') ?? u.searchParams.get('start') ?? undefined)
  return start ? { provider: 'youtube', id, start } : { provider: 'youtube', id }
}

function vimeoRef(u: URL): VideoRef | null {
  const host = bareHost(u)
  let id: string | undefined
  let hash: string | undefined
  if (host === 'player.vimeo.com') {
    const m = /^\/video\/(\d{1,12})\/?$/.exec(u.pathname)
    if (!m) return null
    id = m[1]
    hash = u.searchParams.get('h') || undefined
  } else if (host === 'vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length === 1 || parts.length === 2) {
      if (VIMEO_ID_RE.test(parts[0])) {
        id = parts[0]
        if (parts[1]) hash = parts[1]
      }
    } else if (parts.length === 3 && parts[0] === 'channels' && VIMEO_ID_RE.test(parts[2])) id = parts[2]
    else if (parts.length === 4 && parts[0] === 'groups' && parts[2] === 'videos' && VIMEO_ID_RE.test(parts[3])) id = parts[3]
  }
  if (!id || !VIMEO_ID_RE.test(id)) return null
  if (hash !== undefined && !VIMEO_HASH_RE.test(hash)) return null
  const t = /(?:^|&)t=([^&]+)/.exec(u.hash.replace(/^#/, ''))
  const start = parseStartTime(t ? t[1] : undefined)
  return { provider: 'vimeo', id, ...(hash ? { hash } : {}), ...(start ? { start } : {}) }
}

/** The video an absolute YouTube / Vimeo URL points at; null for anything else. */
export function parseVideoUrl(input: unknown): VideoRef | null {
  if (typeof input !== 'string') return null
  const u = parseUrl(input.trim())
  if (!u || u.username || u.password) return null
  return youtubeRef(u) || vimeoRef(u)
}

/**
 * The 11-character id of a YouTube URL (watch?v=, youtu.be/, /embed/,
 * /shorts/, /live/, youtube-nocookie) or of a bare id; null otherwise.
 */
export function youtubeId(input: string): string | null {
  const raw = String(input ?? '').trim()
  if (YOUTUBE_ID_RE.test(raw)) return raw
  const ref = parseVideoUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  return ref && ref.provider === 'youtube' ? ref.id : null
}

/** The public watch page of a video (feeds, the "Watch on …" link). */
export function videoWatchUrl(v: VideoRef): string {
  if (v.provider === 'youtube') return `https://www.youtube.com/watch?v=${v.id}${v.start ? `&t=${v.start}s` : ''}`
  return `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ''}${v.start ? `#t=${v.start}s` : ''}`
}

/**
 * The privacy-enhanced player URL: youtube-nocookie.com, or Vimeo with
 * `dnt=1` (no tracking cookies or session data). Loaded only on click.
 */
export function videoPlayerUrl(v: VideoRef, opts: { autoplay?: boolean } = {}): string {
  const params: string[] = []
  if (v.provider === 'youtube') {
    if (opts.autoplay) params.push('autoplay=1')
    if (v.start) params.push(`start=${v.start}`)
    return `https://www.youtube-nocookie.com/embed/${v.id}${params.length ? `?${params.join('&')}` : ''}`
  }
  if (v.hash) params.push(`h=${v.hash}`)
  if (opts.autoplay) params.push('autoplay=1')
  params.push('dnt=1')
  return `https://player.vimeo.com/video/${v.id}?${params.join('&')}${v.start ? `#t=${v.start}s` : ''}`
}

/** A video reference from the facade element's properties (compiled tree / React props); null when invalid. */
export function videoRefFromProps(p: Record<string, unknown>): VideoRef | null {
  const pick = (...keys: string[]) => {
    for (const k of keys) if (p[k] !== undefined && p[k] !== null) return String(p[k])
    return ''
  }
  const start = parseStartTime(pick('dataStart', 'data-start') || undefined)
  const yt = pick('dataYoutubeId', 'data-youtube-id')
  if (yt) return YOUTUBE_ID_RE.test(yt) ? { provider: 'youtube', id: yt, ...(start ? { start } : {}) } : null
  const vimeo = pick('dataVimeoId', 'data-vimeo-id')
  if (!VIMEO_ID_RE.test(vimeo)) return null
  const hash = pick('dataVimeoHash', 'data-vimeo-hash')
  if (hash && !VIMEO_HASH_RE.test(hash)) return null
  return { provider: 'vimeo', id: vimeo, ...(hash ? { hash } : {}), ...(start ? { start } : {}) }
}
