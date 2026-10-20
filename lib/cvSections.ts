/**
 * CV section registry — the single description of every CV section type:
 * which fields it has, how entries are titled, and the blank templates used
 * when adding content. The Studio editor renders its forms from this, so a
 * field added here is immediately editable *and* individually hideable.
 *
 * Keys match the stored cvdata shape exactly (e.g. competitionAwards.awards,
 * extraSkill.points) so the A4 sheet, /about and snapshots keep working.
 */

import {
  PAPERS_KEY,
  PUBLICATIONS_SECTION,
  PUBLICATION_STATUSES,
  STATUS_LABELS,
  VENUE_TYPES,
  VENUE_TYPE_LABELS,
  isPublicationStatus,
} from './publications/types'

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'month' // YYYY-MM (also accepts YYYY / YYYY-MM-DD already stored)
  | 'endMonth' // month + "Present" switch
  | 'url'
  | 'email'
  | 'tel'
  | 'color'
  | 'bullets' // string[] edited one line per bullet
  | 'tags' // string[] edited as chips
  | 'image' // uploaded image URL ('/uploads/…' or https://)
  | 'switch' // boolean on / off
  | 'select' // one of `options` (or empty)
  | 'yearMonth' // YYYY or YYYY-MM, typed (a year alone is common for papers)

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  placeholder?: string
  /** Grid span in the 2-column entry form (default 1; textarea/bullets default 2). */
  span?: 1 | 2
  /** Can be hidden individually (default true). Styling fields are not. */
  hideable?: boolean
  required?: boolean
  help?: string
  /** 'select': the allowed values (stored) and their labels (shown in the Studio). */
  options?: ReadonlyArray<{ value: string; label: string }>
  /**
   * A language-neutral value (a status, a DOI, a date, a link): with linked
   * languages an edit also sets the same field on the aligned entry of the
   * other language (text fields stay per language).
   */
  shared?: boolean
  /**
   * Extra validation of a text value: 'doi' (10.xxxx/…), 'https-link'
   * (https:// or a same-site path), 'orcid' (an ORCID iD with a correct
   * checksum; a pasted https://orcid.org/… link is accepted and stored as
   * the bare iD).
   */
  format?: 'doi' | 'https-link' | 'orcid'
  /** The save is refused when this field is empty while the named sibling field has content. */
  requiredWhen?: string
}

export interface ListDef {
  key: string
  label: string
  /** Singular noun for buttons: "Add degree". */
  itemNoun: string
  fields: FieldDef[]
  /** Nested object lists (features of a job, certificates of an issuer). */
  lists?: ListDef[]
  /** Compact list rendering (bullet-like rows) for nested lists. */
  compact?: boolean
  titleOf: (item: any) => string
  subtitleOf?: (item: any) => string
  blank: () => Record<string, any>
  /** The list as a whole can be hidden (stored in the parent's hiddenFields). */
  hideable?: boolean
}

export interface SectionDef {
  sessionName: string
  label: string
  description: string
  headerDefault: { en: string; zh: string }
  fields?: FieldDef[]
  lists?: ListDef[]
  /**
   * Where the Website switch publishes this section (CV Studio's sidebar
   * says so); WEBSITE_WHERE_DEFAULT when not set.
   */
  websiteWhere?: string
}

/** Where a CV section appears on the website unless its definition says otherwise. */
export const WEBSITE_WHERE_DEFAULT = '/about, home'

/** Where the Website switch of section `sessionName` publishes it (CV Studio's sidebar note). */
export function websiteWhere(sessionName: string | null | undefined): string {
  return (sessionName && SECTION_BY_NAME[sessionName]?.websiteWhere) || WEBSITE_WHERE_DEFAULT
}

const join = (...parts: unknown[]) =>
  parts.filter((p) => typeof p === 'string' && p.trim()).join(' · ')

const FEATURES: ListDef = {
  key: 'features',
  label: 'Highlights',
  itemNoun: 'highlight',
  compact: true,
  hideable: true,
  fields: [
    { key: 'description', label: 'Highlight', kind: 'textarea', span: 2, placeholder: 'What you did and the measurable result' },
    { key: 'furtherExplanation', label: 'Sub-points', kind: 'bullets', span: 2, placeholder: 'Optional detail' },
  ],
  titleOf: (it) => it?.description || '',
  blank: () => ({ description: '', furtherExplanation: [] }),
}

export const CV_SECTIONS: SectionDef[] = [
  {
    sessionName: 'personalInformation',
    label: 'Personal Info',
    description: 'Name, contact details and summary at the top of the CV.',
    headerDefault: { en: 'Personal Information', zh: '个人信息' },
    fields: [
      { key: 'firstName', label: 'First name', kind: 'text', required: true },
      { key: 'lastName', label: 'Last name', kind: 'text', required: true },
      { key: 'nickName', label: 'Preferred name', kind: 'text' },
      { key: 'email', label: 'Email', kind: 'email' },
      { key: 'phoneNumber', label: 'Phone', kind: 'tel' },
      { key: 'personalWebsite', label: 'Website', kind: 'url', placeholder: 'example.com' },
      {
        key: 'github',
        label: 'GitHub',
        kind: 'url',
        placeholder: 'https://github.com/you',
        help: 'In the CV header, its files and the vCard. Empty: the Home → Socials link. Hide it to leave GitHub off.',
      },
      {
        key: 'linkedin',
        label: 'LinkedIn',
        kind: 'url',
        placeholder: 'https://www.linkedin.com/in/you',
        help: 'In the CV header, its files and the vCard. Empty: the Home → Socials link. Hide it to leave LinkedIn off.',
      },
      {
        key: 'orcid',
        label: 'ORCID iD',
        kind: 'text',
        format: 'orcid',
        shared: true,
        span: 2,
        placeholder: '0000-0000-0000-0000',
        help: 'Paste your iD or its https://orcid.org/… link (the bare iD is stored), or connect it by signing in to ORCID. Shown on /cv, /publications and /about, in the CV files, the vCard and structured data; Publications can import your works from it. Hide it to leave ORCID off everywhere.',
      },
      { key: 'address', label: 'Location', kind: 'text', span: 2 },
      { key: 'introduction', label: 'Summary', kind: 'textarea', span: 2 },
      { key: 'separatorColor', label: 'Accent / rule color', kind: 'color', hideable: false },
      {
        key: 'photo',
        label: 'Photo (PDF only)',
        kind: 'image',
        span: 2,
        hideable: false,
        help: 'Optional ID-style photo for the downloadable PDF of this language. Never shown on the website, in search results, the structured data (JSON-LD) or the vCard.',
      },
      {
        key: 'photoOnPdf',
        label: 'Put the photo on this language’s PDF',
        kind: 'switch',
        span: 2,
        hideable: false,
        help: 'Off by default. EN and 中文 are separate PDFs: switch it on in each language where a photo is expected.',
      },
    ],
  },
  {
    sessionName: 'education',
    label: 'Education',
    description: 'Degrees, schools and grades.',
    headerDefault: { en: 'EDUCATION', zh: '教育经历' },
    lists: [
      {
        key: 'educationExperience',
        label: 'Degrees',
        itemNoun: 'degree',
        fields: [
          { key: 'schoolName', label: 'School', kind: 'text', required: true },
          { key: 'schoolLocation', label: 'Location', kind: 'text' },
          { key: 'degree', label: 'Degree', kind: 'text', span: 2 },
          { key: 'major', label: 'Major', kind: 'text', help: 'Shown only when the degree title does not already contain it.' },
          { key: 'gpa', label: 'GPA', kind: 'text', placeholder: '3.6 / 4.0' },
          { key: 'startDate', label: 'Start', kind: 'month' },
          { key: 'endDate', label: 'End / expected', kind: 'endMonth' },
        ],
        titleOf: (it) => it?.schoolName || '',
        subtitleOf: (it) => it?.degree || '',
        blank: () => ({ schoolName: '', schoolLocation: '', degree: '', major: '', startDate: '', endDate: '', gpa: '' }),
      },
    ],
  },
  {
    sessionName: 'workExperience',
    label: 'Experience',
    description: 'Jobs, internships and roles.',
    headerDefault: { en: 'WORK EXPERIENCE', zh: '工作经历' },
    lists: [
      {
        key: 'experiences',
        label: 'Roles',
        itemNoun: 'role',
        fields: [
          { key: 'jobTitle', label: 'Title', kind: 'text', required: true },
          { key: 'companyName', label: 'Company', kind: 'text', required: true },
          { key: 'companyURL', label: 'Company website', kind: 'url' },
          { key: 'location', label: 'Location', kind: 'text' },
          { key: 'startDate', label: 'Start', kind: 'month' },
          { key: 'endDate', label: 'End', kind: 'endMonth' },
          { key: 'jobDescription', label: 'Summary', kind: 'textarea', span: 2 },
          { key: 'relatedSkills', label: 'Skills', kind: 'tags', span: 2, placeholder: 'Type a skill, press Enter' },
        ],
        lists: [FEATURES],
        titleOf: (it) => it?.jobTitle || '',
        subtitleOf: (it) => join(it?.companyName, it?.location),
        blank: () => ({
          jobTitle: '',
          companyName: '',
          companyURL: '',
          location: '',
          startDate: '',
          endDate: '',
          jobDescription: '',
          features: [],
          relatedSkills: [],
        }),
      },
    ],
  },
  {
    sessionName: 'project',
    label: 'Projects',
    description: 'Projects with dates and highlights.',
    headerDefault: { en: 'PROJECT EXPERIENCE', zh: '项目经历' },
    lists: [
      {
        key: 'projectExperience',
        label: 'Projects',
        itemNoun: 'project',
        fields: [
          { key: 'title', label: 'Title', kind: 'text', required: true, span: 2 },
          { key: 'role', label: 'Your role', kind: 'text', placeholder: 'Lead developer', help: 'Shown in the /work archive. Not printed on the CV.' },
          { key: 'projectLocation', label: 'Location', kind: 'text' },
          { key: 'relatedSkills', label: 'Stack', kind: 'tags', span: 2, placeholder: 'Type a technology, press Enter', help: 'Shown in the /work archive and its filter. Not printed on the CV.' },
          { key: 'startDate', label: 'Start', kind: 'month' },
          { key: 'endDate', label: 'End', kind: 'endMonth' },
          { key: 'description', label: 'Summary', kind: 'textarea', span: 2 },
          {
            key: 'caseStudy',
            label: 'Case study slug (/work/…)',
            kind: 'text',
            placeholder: 'my-project',
            help: 'Links this project to its published case study: on the home and about pages, and as a link under the project on the CV and its PDF.',
          },
          {
            key: 'url',
            label: 'Live site',
            kind: 'url',
            placeholder: 'https://example.com',
            help: 'Printed under the project on the CV. Empty: the linked case study’s live link is used.',
          },
          {
            key: 'repo',
            label: 'Source code',
            kind: 'url',
            placeholder: 'https://github.com/you/project',
            help: 'Printed under the project on the CV. Empty: the linked case study’s repository is used.',
          },
        ],
        lists: [FEATURES],
        titleOf: (it) => it?.title || '',
        subtitleOf: (it) => it?.projectLocation || '',
        blank: () => ({ title: '', startDate: '', endDate: '', projectLocation: '', description: '', caseStudy: '', url: '', repo: '', features: [] }),
      },
    ],
  },
  {
    sessionName: 'patents',
    label: 'Patents',
    description: 'Patent applications and grants.',
    headerDefault: { en: 'PATENTS', zh: '专利' },
    lists: [
      {
        key: 'patentExperience',
        label: 'Patent groups',
        itemNoun: 'patent group',
        fields: [
          { key: 'title', label: 'Title / role', kind: 'text', required: true, span: 2 },
          { key: 'organization', label: 'Assignee / organization', kind: 'text', span: 2 },
          { key: 'authority', label: 'Authority', kind: 'text', placeholder: 'CNIPA / USPTO' },
          { key: 'status', label: 'Status', kind: 'text', placeholder: 'Granted / Pending' },
          { key: 'date', label: 'Date', kind: 'text', placeholder: '2026 or 2026-03' },
          { key: 'patents', label: 'Patents', kind: 'bullets', span: 2 },
        ],
        titleOf: (it) => it?.title || '',
        subtitleOf: (it) => join(it?.organization, it?.status),
        blank: () => ({ title: '', organization: '', authority: '', status: '', date: '', patents: [] }),
      },
    ],
  },
  {
    sessionName: 'competitionAwards',
    label: 'Awards',
    description: 'Competitions, prizes and recognition.',
    headerDefault: { en: 'COMPETITIONS & AWARDS', zh: '竞赛与奖项' },
    lists: [
      {
        key: 'awards',
        label: 'Awards',
        itemNoun: 'award',
        fields: [
          { key: 'contestName', label: 'Competition', kind: 'text', required: true, span: 2 },
          { key: 'award', label: 'Result / award', kind: 'text', span: 2 },
          { key: 'organization', label: 'Organizer', kind: 'text' },
          { key: 'location', label: 'Location', kind: 'text' },
          { key: 'date', label: 'Date', kind: 'month' },
          { key: 'description', label: 'Details', kind: 'bullets', span: 2 },
        ],
        titleOf: (it) => it?.contestName || '',
        subtitleOf: (it) => it?.award || '',
        blank: () => ({ contestName: '', award: '', organization: '', date: '', location: '', description: [] }),
      },
    ],
  },
  {
    sessionName: 'skill',
    label: 'Skills',
    description: 'Languages / tools with proficiency, and grouped technical skills.',
    headerDefault: { en: 'TECHNICAL SKILLS', zh: '专业技能' },
    lists: [
      {
        key: 'languages',
        label: 'Core skills',
        itemNoun: 'skill',
        hideable: true,
        fields: [
          { key: 'language', label: 'Skill', kind: 'text', required: true },
          { key: 'level', label: 'Proficiency / note', kind: 'text' },
        ],
        titleOf: (it) => it?.language || '',
        subtitleOf: (it) => it?.level || '',
        blank: () => ({ language: '', level: '' }),
      },
      {
        key: 'technical',
        label: 'Skill groups',
        itemNoun: 'group',
        hideable: true,
        fields: [
          { key: 'name', label: 'Group name', kind: 'text', required: true, span: 2 },
          { key: 'description', label: 'Items', kind: 'bullets', span: 2 },
        ],
        titleOf: (it) => it?.name || '',
        subtitleOf: (it) => (Array.isArray(it?.description) ? it.description.filter(Boolean).join(', ') : ''),
        blank: () => ({ name: '', description: [] }),
      },
    ],
  },
  {
    sessionName: 'selfAssessment',
    label: 'Self-assessment',
    description: 'A short personal statement (自我评价) — customary at the end of a Chinese CV. Shown only when filled.',
    headerDefault: { en: 'SELF-ASSESSMENT', zh: '自我评价' },
    fields: [
      { key: 'text', label: 'Statement', kind: 'textarea', span: 2, placeholder: 'A few sentences in your own words' },
      { key: 'points', label: 'Points', kind: 'bullets', span: 2, placeholder: 'Optional: one strength per line' },
    ],
  },
  {
    sessionName: 'recommendations',
    label: 'Recommendations',
    description:
      'Quotes from people you worked with, entered by you with their permission. Use the CV and Website switches to choose /cv, /about or both; nothing shows until an entry has permission.',
    headerDefault: { en: 'RECOMMENDATIONS', zh: '推荐语' },
    lists: [
      {
        key: 'items',
        label: 'Recommendations',
        itemNoun: 'recommendation',
        fields: [
          { key: 'quote', label: 'Quote', kind: 'textarea', span: 2, required: true, placeholder: 'Their words, verbatim' },
          { key: 'name', label: 'Name', kind: 'text', required: true },
          { key: 'role', label: 'Their role', kind: 'text', placeholder: 'Title, organisation' },
          { key: 'relation', label: 'Relation to you', kind: 'text', placeholder: 'e.g. managed me at …' },
          { key: 'date', label: 'Date given', kind: 'month' },
          { key: 'sourceUrl', label: 'Source link', kind: 'url', span: 2, help: 'Optional: where the recommendation was published (https).' },
          {
            key: 'permission',
            label: 'They agreed to have this published',
            kind: 'switch',
            span: 2,
            hideable: false,
            help: 'Required. Entries without it never leave the admin — not on the pages, the PDF or the API.',
          },
        ],
        titleOf: (it) => it?.name || '',
        subtitleOf: (it) => join(it?.role, it?.permission === true ? '' : 'no permission yet'),
        blank: () => ({ quote: '', name: '', role: '', relation: '', date: '', sourceUrl: '', permission: false }),
      },
    ],
  },
  {
    sessionName: 'extraSkill',
    label: 'Languages',
    description: 'Spoken languages or any extra one-line points.',
    headerDefault: { en: 'LANGUAGE SKILLS', zh: '语言能力' },
    fields: [{ key: 'points', label: 'Points', kind: 'bullets', span: 2, placeholder: 'English: Professional working proficiency' }],
  },
  {
    sessionName: 'certification',
    label: 'Certifications',
    description: 'Certificates grouped by issuer.',
    headerDefault: { en: 'CERTIFICATIONS', zh: '证书' },
    lists: [
      {
        key: 'certifications',
        label: 'Issuers',
        itemNoun: 'issuer',
        fields: [
          { key: 'issuingOrganization', label: 'Issuer', kind: 'text', required: true },
          { key: 'organizationURL', label: 'Issuer website', kind: 'url' },
        ],
        lists: [
          {
            key: 'CertificationList',
            label: 'Certificates',
            itemNoun: 'certificate',
            fields: [
              { key: 'certificationName', label: 'Certificate', kind: 'text', required: true, span: 2 },
              { key: 'issuedDate', label: 'Issued', kind: 'month' },
              { key: 'expirationDate', label: 'Expires', kind: 'month', help: 'Leave empty for no expiry.' },
              { key: 'credentialID', label: 'Credential ID', kind: 'text' },
              { key: 'credentialURL', label: 'Credential URL', kind: 'url' },
            ],
            titleOf: (it) => it?.certificationName || '',
            subtitleOf: (it) => it?.credentialID || '',
            blank: () => ({ certificationName: '', issuedDate: '', expirationDate: '', credentialID: '', credentialURL: '' }),
          },
        ],
        titleOf: (it) => it?.issuingOrganization || '',
        subtitleOf: (it) =>
          Array.isArray(it?.CertificationList) ? `${it.CertificationList.length} certificate(s)` : '',
        blank: () => ({ issuingOrganization: '', organizationURL: '', CertificationList: [] }),
      },
    ],
  },
  // ── Publications (论文) — lib/publications ────────────────────────────
  {
    sessionName: PUBLICATIONS_SECTION,
    label: 'Publications',
    description:
      'Papers, preprints and theses, listed by status, then newest first. CV switch: the A4 CV and /cv. Website switch: the /publications page and its nav link. While the languages are linked, status, venue type, date, numbers, DOI and links are shared by EN and 中文.',
    headerDefault: { en: 'Publications', zh: '论文' },
    websiteWhere: '/publications',
    lists: [
      {
        key: PAPERS_KEY,
        label: 'Papers',
        itemNoun: 'paper',
        fields: [
          { key: 'title', label: 'Title', kind: 'text', required: true, span: 2 },
          {
            key: 'authors',
            label: 'Authors',
            kind: 'bullets',
            span: 2,
            placeholder: 'Yanpei Li',
            help: 'One author per row, in the paper’s order; your own name is emphasised automatically. Write a family-name-first name with a comma (Li, Yanpei). Marks such as * or † are kept. A hidden author shows as “…” so the order stays true.',
          },
          {
            key: 'venue',
            label: 'Venue',
            kind: 'text',
            span: 2,
            placeholder: 'Journal, conference, repository (arXiv) or school',
            help: 'Not shown while the paper is under review: a manuscript under review is cited without the journal it was sent to.',
          },
          {
            key: 'venueType',
            label: 'Venue type',
            kind: 'select',
            shared: true,
            options: VENUE_TYPES.map((v) => ({ value: v, label: VENUE_TYPE_LABELS[v].en })),
          },
          {
            key: 'status',
            label: 'Status',
            kind: 'select',
            shared: true,
            required: true,
            requiredWhen: 'title',
            options: PUBLICATION_STATUSES.map((v) => ({ value: v, label: STATUS_LABELS[v].en })),
            help: 'Anything not yet published is labelled with this status everywhere.',
          },
          { key: 'date', label: 'Date', kind: 'yearMonth', shared: true, placeholder: '2026 or 2026-03' },
          { key: 'pages', label: 'Pages', kind: 'text', shared: true, placeholder: '45–67' },
          { key: 'volume', label: 'Volume', kind: 'text', shared: true },
          { key: 'issue', label: 'Issue', kind: 'text', shared: true },
          { key: 'publisher', label: 'Publisher', kind: 'text', span: 2 },
          { key: 'doi', label: 'DOI', kind: 'text', shared: true, format: 'doi', span: 2, placeholder: '10.1234/abcd.5678', help: 'A doi.org link works too.' },
          { key: 'url', label: 'Paper page', kind: 'url', shared: true, format: 'https-link', placeholder: 'https://…' },
          { key: 'pdfUrl', label: 'PDF', kind: 'url', shared: true, format: 'https-link', placeholder: 'https://… or /uploads/paper.pdf' },
          { key: 'codeUrl', label: 'Code', kind: 'url', shared: true, format: 'https-link', placeholder: 'https://github.com/…' },
          { key: 'slidesUrl', label: 'Slides', kind: 'url', shared: true, format: 'https-link', placeholder: 'https://…' },
          { key: 'abstract', label: 'Abstract', kind: 'textarea', span: 2, help: 'Collapsible on the website; never printed.' },
          { key: 'keywords', label: 'Keywords', kind: 'tags', span: 2, placeholder: 'Type a keyword, press Enter' },
          { key: 'award', label: 'Award', kind: 'text', span: 2, placeholder: 'Best Paper Award' },
        ],
        titleOf: (it) => it?.title || '',
        subtitleOf: (it) =>
          join(it?.venue, isPublicationStatus(it?.status) ? STATUS_LABELS[it.status as keyof typeof STATUS_LABELS].en : '', typeof it?.date === 'string' ? it.date.slice(0, 4) : ''),
        blank: () => ({
          title: '',
          authors: [],
          venue: '',
          venueType: '',
          status: '',
          date: '',
          volume: '',
          issue: '',
          pages: '',
          publisher: '',
          doi: '',
          url: '',
          pdfUrl: '',
          codeUrl: '',
          slidesUrl: '',
          abstract: '',
          keywords: [],
          award: '',
        }),
      },
    ],
  },
]

export const SECTION_BY_NAME: Record<string, SectionDef> = Object.fromEntries(
  CV_SECTIONS.map((s) => [s.sessionName, s]),
)

/** Blank, correctly-shaped section for "Add section". */
export function blankSection(sessionName: string, lang: 'en' | 'zh'): Record<string, any> | null {
  const def = SECTION_BY_NAME[sessionName]
  if (!def) return null
  const out: Record<string, any> = { sessionName, headerName: def.headerDefault[lang], isVisible: true }
  for (const f of def.fields || []) {
    out[f.key] = f.kind === 'bullets' || f.kind === 'tags' ? [] : f.kind === 'color' ? '#0059ff' : f.kind === 'switch' ? false : ''
  }
  for (const l of def.lists || []) out[l.key] = []
  return out
}

export function defaultSpan(f: FieldDef): 1 | 2 {
  if (f.span) return f.span
  return f.kind === 'textarea' || f.kind === 'bullets' || f.kind === 'tags' || f.kind === 'image' ? 2 : 1
}

export function isFieldHideable(f: FieldDef): boolean {
  return f.hideable !== false
}
