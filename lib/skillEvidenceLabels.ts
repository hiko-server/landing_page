/**
 * The kinds of skill evidence (lib/skillEvidence) and their labels, EN and
 * 中文. Client-safe and tiny: the /cv page's evidence rows import this, not
 * the matcher.
 */

import type { CvLang } from './cvVisibility'

export type EvidenceKind = 'role' | 'project' | 'award' | 'patent' | 'paper' | 'caseStudy' | 'post'

export const EVIDENCE_KIND_LABELS: Record<CvLang, Record<EvidenceKind, string>> = {
  en: { role: 'Role', project: 'Project', award: 'Award', patent: 'Patent', paper: 'Paper', caseStudy: 'Case study', post: 'Writing' },
  zh: { role: '职位', project: '项目', award: '奖项', patent: '专利', paper: '论文', caseStudy: '案例', post: '文章' },
}
