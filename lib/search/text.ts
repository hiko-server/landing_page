/**
 * Text analysis shared by site search (the ⌘K palette, the 404 page) and
 * "Ask" (lib/ask/engine.ts). Pure, no dependencies, runs on the server and in
 * the browser.
 *
 *   foldText     case / width / accent folding that keeps every UTF-16
 *                index in place, so a match found in the folded copy can be
 *                highlighted in the original ("Ｐython" → "python",
 *                "Résumé" → "resume", "（" → "(").
 *   tokenize     word tokens with their offsets: Latin / digit words are
 *                lower-cased and lightly stemmed (patents → patent,
 *                studied → study); CJK runs become overlapping character
 *                bigrams (香港中文大学 → 香港 港中 中文 文大 大学), a lone CJK
 *                character stays a unigram. Bigrams need no dictionary and
 *                find a two-character word wherever it appears.
 *   cjkWords     dictionary words of a CJK run for QUERIES (Intl.Segmenter,
 *                with a particle-stripping fallback): 他有专利吗 → 他 有 专利 吗.
 *   stop words   English function and question words and Chinese particles /
 *                question words, removed from queries only (the index keeps
 *                every word: a phrase is never broken).
 */

/** Han, kana and Hangul: the scripts written without spaces. */
export const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const CJK_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu
const NON_ASCII_RE = /[^\x00-\x7f]/gu
const MARKS_RE = /\p{M}+/gu

export function hasCjk(text: string): boolean {
  return CJK_RE.test(text)
}

const foldCache = new Map<string, string>()

function foldChar(ch: string): string {
  const hit = foldCache.get(ch)
  if (hit !== undefined) return hit
  let out = ch.normalize('NFKC').normalize('NFD').replace(MARKS_RE, '').toLowerCase()
  if (out.length !== ch.length) {
    const lower = ch.toLowerCase()
    out = lower.length === ch.length ? lower : ch
  }
  if (foldCache.size < 4096) foldCache.set(ch, out)
  return out
}

/**
 * Lower-case, NFKC width folding and accent stripping, one character at a
 * time and only where the result keeps the character's UTF-16 length: the
 * folded string has the same length as the input, so offsets carry over.
 */
export function foldText(text: string): string {
  const lower = text.toLowerCase()
  // Fast path: ASCII only (toLowerCase never changes ASCII lengths).
  if (lower.length === text.length && !/[^\x00-\x7f]/.test(text)) return lower
  return text.replace(NON_ASCII_RE, foldChar).replace(/[A-Z]/g, (c) => c.toLowerCase())
}

// ── English ────────────────────────────────────────────────────────────────

const VOWEL_RE = /[aeiouy]/

/**
 * A light English stemmer: plurals and the common verb endings, nothing
 * that changes a word's meaning (patents → patent, studies / studied →
 * study, awarded → award, running → run, classes → class). Words of three
 * letters or fewer, and digits, are kept as typed.
 */
export function stem(word: string): string {
  let w = word
  if (w.length <= 3 || !/^[a-z]+$/.test(w)) return w
  if (w.endsWith("'s")) w = w.slice(0, -2)
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`
  if (w.endsWith('ied') && w.length > 4) return `${w.slice(0, -3)}y`
  if (w.endsWith('sses')) return w.slice(0, -2)
  if (/(?:x|ch|sh|z)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !/(?:ss|us|is|os)$/.test(w)) return w.slice(0, -1)
  const undouble = (s: string) => (/([b-df-hj-np-tv-z])\1$/.test(s) && !/(?:ll|ss|zz)$/.test(s) ? s.slice(0, -1) : s)
  if (w.endsWith('ing') && w.length > 5) {
    const base = w.slice(0, -3)
    if (VOWEL_RE.test(base)) return undouble(base)
  }
  if (w.endsWith('ed') && w.length > 4) {
    const base = w.slice(0, -2)
    if (VOWEL_RE.test(base)) return undouble(base)
  }
  return w
}

/** English words that carry no meaning in a question ("does he have patents?" → patents). */
export const EN_STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or but nor of in on at to for from by with about as into onto than then so such ' +
    'is are was were be been being am do does did done doing has have had having get got gets ' +
    'he him his himself she her hers herself they them their theirs it its i me my mine you your yours we our us ' +
    'what which who whom whose where when why how whether any anything some something there here this that these those ' +
    'can could would will shall should may might must ever also just very much many more most own ' +
    'please tell show give list know let lets kind sort type sorts kinds lot lots thing things time ' +
    'yes no not if else use used uses using utilize utilized hold holds held possess'
  ).split(' '),
)

/** English question openers: a query starting with one reads as a question. */
const EN_QUESTION_START = /^(?:what|which|who|whom|whose|where|when|why|how|does|do|did|is|are|was|were|has|have|had|can|could|would|will|should|tell me|show me)\b/i

// ── Chinese ────────────────────────────────────────────────────────────────

/**
 * Chinese particles, pronouns and question words removed from QUERIES (他有专利吗 → 专利).
 * Applied to whole dictionary words only, so 有限 or 能源 survive.
 */
export const ZH_STOP_WORDS: ReadonlySet<string> = new Set(
  (
    '请问 请 问 一下 是否 有没有 有无 是不是 能不能 会不会 可不可以 可以 什么 甚么 哪些 哪里 哪儿 哪个 哪家 哪所 哪 ' +
    '怎么 怎样 怎么样 如何 为什么 为何 多少 几 几个 吗 呢 吧 啊 呀 么 嘛 的 地 得 了 过 着 ' +
    '他 她 它 他的 她的 他们 她们 您 你 你们 我 我们 自己 本人 这 那 这个 那个 这些 那些 一些 有些 ' +
    '是 有 在 和 与 及 以及 或 或者 也 都 就 还 又 很 会 能 要 想 做 做过 干 干过 曾 曾经 一直 吗？ ' +
    '关于 对于 方面 情况 东西 哪方面 哪一些 获得 取得 拥有 获得过 拿过 ' +
    '用 用过 使用 使用过 会用 懂 懂得 了解 知道 接触 接触过 学过 参加 参加过 参与 参与过 担任 担任过 从事 从事过'
  ).split(' '),
)

/** Characters that never start or end a Chinese content word (the fallback splitter strips them at the edges). */
const ZH_EDGE_PARTICLES = new Set(Array.from('他她它你您我是有在的了过着吗呢吧啊呀么嘛和与及或也都就还又很会能要想做曾请问'))

const ZH_QUESTION_RE = /[吗呢？?]|什么|哪|怎么|怎样|如何|为什么|是否|有没有|是不是|多少|几个|请问/

type Segmenter = { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> }

let zhSegmenter: Segmenter | null | undefined

function segmenter(): Segmenter | null {
  if (zhSegmenter !== undefined) return zhSegmenter
  try {
    const Ctor = (Intl as unknown as { Segmenter?: new (locale: string, opts: { granularity: 'word' }) => Segmenter }).Segmenter
    zhSegmenter = Ctor ? new Ctor('zh', { granularity: 'word' }) : null
  } catch {
    zhSegmenter = null
  }
  return zhSegmenter
}

/** Fallback without Intl.Segmenter: split at multi-character stop words, then trim particles off the edges. */
function fallbackCjkWords(run: string): string[] {
  const phrases = Array.from(ZH_STOP_WORDS)
    .filter((w) => w.length > 1 && hasCjk(w))
    .sort((a, b) => b.length - a.length)
  let parts = [run]
  for (const p of phrases) parts = parts.flatMap((s) => s.split(p))
  const out: string[] = []
  for (let part of parts) {
    let chars = Array.from(part)
    while (chars.length && ZH_EDGE_PARTICLES.has(chars[0])) chars = chars.slice(1)
    while (chars.length && ZH_EDGE_PARTICLES.has(chars[chars.length - 1])) chars = chars.slice(0, -1)
    part = chars.join('')
    if (part) out.push(part)
  }
  return out
}

/**
 * The words of a CJK run as a query sees them, stop words removed
 * (他在哪里实习过 → 实习; 香港中文大学 → 香港 中文 大学). Uses the browser's
 * dictionary segmenter when there is one.
 */
export function cjkWords(run: string): string[] {
  const seg = segmenter()
  if (!seg) return fallbackCjkWords(run)
  const out: string[] = []
  for (const s of seg.segment(run)) {
    const w = s.segment.trim()
    if (!w || !hasCjk(w) || isZhStopWord(w)) continue
    out.push(w)
  }
  return out
}

/** Single-character stop words (他, 有, 吗 …). */
const ZH_STOP_CHARS = new Set(Array.from(ZH_STOP_WORDS).filter((w) => Array.from(w).length === 1))

/** A stop word, or a "word" made only of stop characters (the segmenter's 他有, 他在). */
export function isZhStopWord(word: string): boolean {
  return ZH_STOP_WORDS.has(word) || Array.from(word).every((ch) => ZH_STOP_CHARS.has(ch))
}

// ── Tokens ─────────────────────────────────────────────────────────────────

export type Token = {
  /** Folded, stemmed (Latin) or bigram / unigram (CJK) term. */
  term: string
  /** UTF-16 offsets in the original text. */
  start: number
  end: number
  cjk: boolean
}

/** Programming-language names whose symbols matter. */
const SYMBOL_WORDS_RE = /(?:^|[^\p{L}\p{N}])(c\+\+|c#|f#|\.net)(?=$|[^\p{L}\p{N}])/gu
const WORD_RE = /[\p{L}\p{N}]+/gu

/** Overlapping bigrams of a CJK string (one character → itself). */
export function bigrams(run: string): string[] {
  const chars = Array.from(run)
  if (chars.length < 2) return chars.length ? [chars[0]] : []
  const out: string[] = []
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1])
  return out
}

/**
 * Word tokens of `text` with offsets into it: stemmed Latin / digit words
 * and CJK bigrams. `folded` may pass a precomputed foldText(text).
 */
export function tokenize(text: string, folded: string = foldText(text)): Token[] {
  const out: Token[] = []
  SYMBOL_WORDS_RE.lastIndex = 0
  for (let m = SYMBOL_WORDS_RE.exec(folded); m; m = SYMBOL_WORDS_RE.exec(folded)) {
    const start = m.index + m[0].indexOf(m[1])
    out.push({ term: m[1], start, end: start + m[1].length, cjk: false })
  }
  WORD_RE.lastIndex = 0
  for (let m = WORD_RE.exec(folded); m; m = WORD_RE.exec(folded)) {
    const word = m[0]
    const base = m.index
    // Split the run into CJK and non-CJK pieces.
    let last = 0
    CJK_RUN_RE.lastIndex = 0
    const pushLatin = (from: number, to: number) => {
      if (to <= from) return
      const w = word.slice(from, to)
      out.push({ term: stem(w), start: base + from, end: base + to, cjk: false })
    }
    for (let c = CJK_RUN_RE.exec(word); c; c = CJK_RUN_RE.exec(word)) {
      pushLatin(last, c.index)
      const run = c[0]
      const chars = Array.from(run)
      let offset = base + c.index
      if (chars.length === 1) out.push({ term: run, start: offset, end: offset + run.length, cjk: true })
      else {
        for (let i = 0; i < chars.length - 1; i++) {
          const term = chars[i] + chars[i + 1]
          out.push({ term, start: offset, end: offset + term.length, cjk: true })
          offset += chars[i].length
        }
      }
      last = c.index + run.length
    }
    pushLatin(last, word.length)
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end)
}

/** True when a query reads as a question rather than keywords. */
export function looksLikeQuestion(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (/[?？]$/.test(q)) return true
  if (hasCjk(q)) return ZH_QUESTION_RE.test(q)
  if (EN_QUESTION_START.test(q)) return true
  return q.split(/\s+/).length >= 4
}
