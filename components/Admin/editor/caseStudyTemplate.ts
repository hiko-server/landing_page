/**
 * The case-study outline offered by the editor ("Use the case-study
 * template" on a new case study, "/Case-study outline" in the slash menu)
 * and the checks that notice it was not finished. Pure, unit-tested.
 *
 * Each section is an h2 followed by a guidance note written as an MDX
 * comment — `{/* Case-study template: … *\/}` — which the compiler drops
 * (lib/rehype/stripMdxExpressions.ts), so a note can never reach the public
 * page even if it is forgotten. The publish checklist warns about notes
 * still in the body and about sections that are still empty.
 *
 * The visual editor shows each note as an MDX block (editor/markdown keeps
 * MDX it does not model verbatim), so both editor tabs insert the same
 * outline.
 */

export type TemplateSection = { heading: string; guide: string }

export const CASE_STUDY_SECTIONS: readonly TemplateSection[] = [
  {
    heading: 'The problem',
    guide: 'Who had the problem, why it mattered and what made it hard: the constraints (time, budget, hardware, team) a reader needs to judge the result.',
  },
  {
    heading: 'My role',
    guide: 'What you owned and decided, who you worked with and for how long. Fill Role, Team and Period in the fields above too.',
  },
  {
    heading: 'Approach',
    guide: 'The options you weighed, the one you chose and why. Name the trade-offs you accepted.',
  },
  {
    heading: 'Architecture',
    guide: 'The system as built: components, data flow and interfaces. A diagram, photo or screenshot helps (drop it in).',
  },
  {
    heading: 'Outcomes',
    guide: 'Measured results and where they come from (test run, benchmark, users). Put the headline numbers in At a glance as well.',
  },
  {
    heading: 'What I learned',
    guide: 'What you would do differently and what carries over to the next project.',
  },
]

/** Marks a guidance note of the outline (also how the checklist finds the ones left over). */
export const TEMPLATE_NOTE_MARK = 'Case-study template:'

/** The outline as raw MDX: h2 headings, each followed by its guidance note. */
export function caseStudyTemplate(sections: readonly TemplateSection[] = CASE_STUDY_SECTIONS): string {
  return sections.map((s) => `## ${s.heading}\n\n{/* ${TEMPLATE_NOTE_MARK} ${s.guide.replace(/\*\//g, '* /')} Delete this note once the section is written. */}`).join('\n\n') + '\n'
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const NOTE_RE = /^\{\/\*\s*Case-study template:[\s\S]*?\*\/\}\s*$/

type Line = { line: number; text: string }

/** Body lines outside fenced code (1-based line numbers). */
function proseLines(body: string): Line[] {
  const out: Line[] = []
  let fence: { char: string; len: number } | null = null
  body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((raw, i) => {
      const m = raw.match(FENCE_RE)
      if (fence) {
        if (m && m[1][0] === fence.char && m[1].length >= fence.len && !raw.slice(m[0].length).trim()) fence = null
        out.push({ line: i + 1, text: '\u0000code' })
        return
      }
      if (m) {
        fence = { char: m[1][0], len: m[1].length }
        out.push({ line: i + 1, text: '\u0000code' })
        return
      }
      out.push({ line: i + 1, text: raw })
    })
  return out
}

/** Lines (1-based) of the outline's guidance notes still in the body. */
export function templateNoteLines(body: string): number[] {
  return proseLines(body)
    .filter((l) => l.text.includes(`{/*`) && l.text.includes(TEMPLATE_NOTE_MARK))
    .map((l) => l.line)
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/

/**
 * h2 sections with nothing written under them yet (only blank lines or the
 * outline's notes before the next h1/h2 or the end of the body).
 */
export function emptySections(body: string): Array<{ heading: string; line: number }> {
  const lines = proseLines(body)
  const out: Array<{ heading: string; line: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const h = HEADING_RE.exec(lines[i].text)
    if (!h || h[1].length !== 2) continue
    let empty = true
    for (let j = i + 1; j < lines.length; j++) {
      const next = HEADING_RE.exec(lines[j].text)
      if (next && next[1].length <= 2) break
      const t = lines[j].text.trim()
      if (!t || NOTE_RE.test(t)) continue
      empty = false
      break
    }
    if (empty) out.push({ heading: h[2], line: lines[i].line })
  }
  return out
}
