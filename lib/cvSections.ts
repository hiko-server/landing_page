/**
 * CV section registry — the single description of every CV section type:
 * which fields it has, how entries are titled, and the blank templates used
 * when adding content. The Studio editor renders its forms from this, so a
 * field added here is immediately editable *and* individually hideable.
 *
 * Keys match the stored cvdata shape exactly (e.g. competitionAwards.awards,
 * extraSkill.points) so the A4 sheet, /about and snapshots keep working.
 */

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
      { key: 'address', label: 'Location', kind: 'text', span: 2 },
      { key: 'introduction', label: 'Summary', kind: 'textarea', span: 2 },
      { key: 'separatorColor', label: 'Accent / rule color', kind: 'color', hideable: false },
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
          { key: 'projectLocation', label: 'Location', kind: 'text' },
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
    out[f.key] = f.kind === 'bullets' || f.kind === 'tags' ? [] : f.kind === 'color' ? '#0059ff' : ''
  }
  for (const l of def.lists || []) out[l.key] = []
  return out
}

export function defaultSpan(f: FieldDef): 1 | 2 {
  if (f.span) return f.span
  return f.kind === 'textarea' || f.kind === 'bullets' || f.kind === 'tags' ? 2 : 1
}

export function isFieldHideable(f: FieldDef): boolean {
  return f.hideable !== false
}
