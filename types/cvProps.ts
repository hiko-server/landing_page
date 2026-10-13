/**
 * Stored CV shape (data/cvdata.json → SQLite kv 'cvdata' → { en, zh }).
 *
 * Every object may also carry the visibility metadata described in
 * lib/cvVisibility.ts (`isVisible`, `showOnWebsite`, `hiddenFields`,
 * `hiddenItems`). Public renderers receive already-pruned data, so they only
 * need to treat empty strings / arrays as "nothing to show".
 */

export type CVData = (
  | PersonalInformation
  | Education
  | Skill
  | Project
  | ExtraSkill
  | Certification
  | Experiences
  | CompetitionAwards
  | Patents
  | Publications
)[]

/** Visibility metadata any stored object may carry. */
export interface Visibility {
  isVisible?: boolean
  hiddenFields?: string[]
  hiddenItems?: Record<string, number[]>
}

export interface CVSection extends Visibility {
  sessionName: string
  headerName: string
  /** Section shown on the website (/about, home). Default true. */
  showOnWebsite?: boolean
}

export interface Experiences extends CVSection {
  experiences: Experience[]
}

export interface Experience extends Visibility {
  companyName: string
  companyURL: string
  jobTitle: string
  jobDescription: string
  location: string
  startDate: string
  endDate: string
  relatedSkills: string[]
  features: Feature[]
}
export interface Feature extends Visibility {
  description: string
  furtherExplanation: string[]
}

export interface CompetitionAwards extends CVSection {
  awards: CompetitionAwardItem[]
}

export interface CompetitionAwardItem extends Visibility {
  contestName: string
  award: string
  organization?: string
  date: string
  location?: string
  description: string[]
}

export interface Certification extends CVSection {
  certifications: CertificationByOrg[]
}

export interface CertificationByOrg extends Visibility {
  issuingOrganization: string
  organizationURL: string
  CertificationList: CertificationList[]
}
export interface CertificationList extends Visibility {
  certificationName: string
  issuedDate: string
  expirationDate: string
  credentialID: string
  credentialURL: string
}

export interface PersonalInformation extends CVSection {
  firstName: string
  lastName: string
  nickName: string
  email: string
  phoneNumber: string
  personalWebsite: string
  /** GitHub profile URL (empty: Home → Socials is used on the CV, lib/cvLinks.ts). */
  github?: string
  /** LinkedIn profile URL (empty: Home → Socials is used on the CV). */
  linkedin?: string
  address: string
  introduction: string
  separatorColor?: string
}

export interface Education extends CVSection {
  educationExperience: EducationExperience[]
}

export interface EducationExperience extends Visibility {
  schoolName: string
  schoolLocation: string
  degree: string
  major: string
  startDate: string
  endDate: string
  gpa?: string
}

export interface Skill extends CVSection {
  languages: Language[]
  technical: Technical[]
}

export interface Language extends Visibility {
  language: string
  level: string
}

export interface Technical extends Visibility {
  name: string
  description: string[]
}

export interface Project extends CVSection {
  projectExperience: ProjectExperience[]
}

export interface ProjectExperience extends Visibility {
  title: string
  startDate: string
  endDate: string
  projectLocation: string
  description: string
  /** Slug of the project's case study (/work/<slug>); public views carry only published slugs. */
  caseStudy?: string
  /** Live site URL. */
  url?: string
  /** Source repository URL. */
  repo?: string
  features: Feature[]
}

export interface ExtraSkill extends CVSection {
  points: string[]
}

export interface Patents extends CVSection {
  patentExperience: PatentGroup[]
}

export interface PatentGroup extends Visibility {
  title: string
  organization?: string
  authority?: string
  status?: string
  date?: string
  patents: string[]
}

/** Publications (论文) — lib/publications describes the entry fields and how they render. */
export interface Publications extends CVSection {
  papers: PublicationItem[]
}

export interface PublicationItem extends Visibility {
  title: string
  /** In the paper's order; a hidden author keeps its place (lib/cvVisibility HIDDEN_ITEM_MARK). */
  authors: string[]
  venue: string
  venueType: '' | 'journal' | 'conference' | 'workshop' | 'preprint' | 'thesis' | 'book-chapter' | 'other'
  status: '' | 'published' | 'in-press' | 'accepted' | 'under-review' | 'preprint'
  /** YYYY or YYYY-MM. */
  date: string
  volume: string
  issue: string
  pages: string
  publisher: string
  doi: string
  url: string
  pdfUrl: string
  codeUrl: string
  slidesUrl: string
  abstract: string
  keywords: string[]
  award: string
}
