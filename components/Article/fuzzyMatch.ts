/**
 * Small fuzzy matcher + ranker for the ⌘K command palette (pure, no deps).
 *
 *   - A contiguous match beats a scattered one; matches at the start of the
 *     text or of a word (after a space/punctuation, a camelCase hump, or any
 *     CJK character) score higher; exact matches score highest.
 *   - Scattered (subsequence) matches reward runs and word starts and are
 *     penalised for gaps, so "gh" finds "GitHub" but not every string that
 *     happens to contain a g and later an h far apart.
 *   - Every whitespace-separated query token must match the label or the
 *     keywords. Only label matches are highlighted.
 */

export type Match = { score: number; indices: number[] }

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const WORDISH_RE = /[\p{L}\p{N}]/u

function isBoundary(text: string, i: number): boolean {
  if (i <= 0) return true
  const ch = text[i]
  const prev = text[i - 1]
  if (CJK_RE.test(ch)) return true
  if (!WORDISH_RE.test(prev)) return true
  return prev === prev.toLowerCase() && ch !== ch.toLowerCase()
}

/** True when q[k..] is a subsequence of t[from..] (spaces in q ignored). */
function canFinish(q: string, k: number, t: string, from: number): boolean {
  let pos = from
  for (let j = k; j < q.length; j++) {
    if (q[j] === ' ') continue
    const next = t.indexOf(q[j], pos)
    if (next < 0) return false
    pos = next + 1
  }
  return true
}

/** Score `query` against `text`; null when it does not match. */
export function fuzzyMatch(query: string, text: string): Match | null {
  const q = query.trim().toLowerCase()
  if (!q) return { score: 0, indices: [] }
  if (!text) return null
  const t = text.toLowerCase()

  const at = t.indexOf(q)
  if (at >= 0) {
    let score = 100
    if (t.length === q.length) score += 60
    else if (at === 0) score += 40
    else if (isBoundary(text, at)) score += 25
    score -= Math.min(at, 30) * 0.5 + Math.min(t.length - q.length, 60) * 0.1
    return { score, indices: Array.from({ length: q.length }, (_, k) => at + k) }
  }

  // Scattered match: for each query char take the next occurrence, preferring
  // a word start when one is reachable before the next plain occurrence run.
  const indices: number[] = []
  let from = 0
  let score = 0
  for (let k = 0; k < q.length; k++) {
    const ch = q[k]
    if (ch === ' ') continue
    let pos = t.indexOf(ch, from)
    if (pos < 0) return null
    const prev = indices[indices.length - 1]
    if (prev === undefined || pos !== prev + 1) {
      // Not continuing a run: jump to a word-start occurrence if there is one.
      for (let p = pos; p >= 0 && p < t.length; p = t.indexOf(ch, p + 1)) {
        if (isBoundary(text, p)) {
          if (canFinish(q, k + 1, t, p + 1)) pos = p
          break
        }
      }
    }
    score += 1
    if (prev !== undefined && pos === prev + 1) score += 3
    if (isBoundary(text, pos)) score += 4
    if (prev !== undefined) score -= Math.min(pos - prev - 1, 25) * 0.4
    else score -= Math.min(pos, 12) * 0.2
    indices.push(pos)
    from = pos + 1
  }
  if (score <= q.replace(/\s/g, '').length * 1.5) return null
  return { score: Math.min(score, 70), indices }
}

export type Searchable = { label: string; keywords?: string; hint?: string }

export type Ranked<T> = { item: T; score: number; indices: number[] }

/**
 * Rank items for `query` (best first, stable for ties). Each token must hit
 * the label (full weight, highlighted) or the keywords / hint (60 %).
 * `boost` adds a per-item bonus (e.g. recently used, group priority).
 */
export function rankItems<T extends Searchable>(items: readonly T[], query: string, boost?: (item: T) => number): Ranked<T>[] {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return items.map((item) => ({ item, score: 0, indices: [] }))
  const whole = query.trim().toLowerCase()

  const out: Array<Ranked<T> & { order: number }> = []
  items.forEach((item, order) => {
    let score = 0
    const hit = new Set<number>()
    for (const tok of tokens) {
      const inLabel = fuzzyMatch(tok, item.label)
      const inMeta = fuzzyMatch(tok, `${item.keywords || ''} ${item.hint || ''}`.trim())
      const metaScore = inMeta ? inMeta.score * 0.6 : -Infinity
      if (!inLabel && !inMeta) return
      if (inLabel && inLabel.score >= metaScore) {
        score += inLabel.score
        inLabel.indices.forEach((i) => hit.add(i))
      } else {
        score += metaScore
      }
    }
    if (tokens.length > 1 && item.label.toLowerCase().includes(whole)) score += 50
    score += boost ? boost(item) : 0
    out.push({ item, score, indices: Array.from(hit).sort((a, b) => a - b), order })
  })
  return out
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ item, score, indices }) => ({ item, score, indices }))
}

/** Split `text` into plain / matched runs for highlighting. */
export function highlightSegments(text: string, indices: readonly number[]): Array<{ text: string; match: boolean }> {
  if (!indices.length) return text ? [{ text, match: false }] : []
  const marked = new Set(indices)
  const out: Array<{ text: string; match: boolean }> = []
  for (let i = 0; i < text.length; i++) {
    const match = marked.has(i)
    const last = out[out.length - 1]
    if (last && last.match === match) last.text += text[i]
    else out.push({ text: text[i], match })
  }
  return out
}
