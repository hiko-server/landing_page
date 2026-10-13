/**
 * Server-side inputs of the CV readiness checks (lib/cvReadiness.ts): the
 * reference month, the home page's public e-mail and the case-study index
 * (drafts included, flagged). SERVER-ONLY (content store). Never throws.
 */

import { referenceMonth } from './clock'
import { readCvData } from './cvdata'
import { listItems } from './contentStore'
import { readPublicHome } from './home'
import { readinessSummary, runReadinessChecks, type ReadinessCaseStudy, type ReadinessContext } from './cvReadiness'

export function readinessContext(): ReadinessContext {
  let homeEmail = ''
  try {
    homeEmail = String(readPublicHome()?.hero?.email || '').trim()
  } catch {
    homeEmail = ''
  }
  let caseStudies: ReadinessCaseStudy[] = []
  try {
    caseStudies = listItems('work').map((w) => ({
      slug: w.slug,
      title: String(w.frontmatter?.title || w.slug),
      draft: !!w.frontmatter?.draft,
    }))
  } catch {
    caseStudies = []
  }
  return { now: referenceMonth(), ...(homeEmail ? { homeEmail } : {}), caseStudies }
}

/** Open / high / dismissed counts for the status hub (page length is measured in the Studio only). */
export function readinessCounts(): { open: number; high: number; dismissed: number } | null {
  try {
    const doc = readCvData()
    return readinessSummary(doc, runReadinessChecks(doc, readinessContext()))
  } catch {
    return null
  }
}
