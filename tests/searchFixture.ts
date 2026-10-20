/**
 * The synthetic, owner-neutral fixture of the search-ask tests (F4 / J1):
 * a public bilingual CV of "Example Person" (example.com), a post and a
 * paper, as the search index carries them. Not a test file itself.
 */
import { parseSearchIndex, type SearchDocLike } from '../components/Article/fuzzyMatch'
import { cvAlignment, cvSearchDocs } from '../lib/searchIndex'
import { publicCvDoc } from '../lib/cvVisibility'

export const CV = publicCvDoc(
  {
    en: [
      { sessionName: 'personalInformation', firstName: 'Example', lastName: 'Person', email: 'person@example.com' },
      {
        sessionName: 'education',
        headerName: 'EDUCATION',
        educationExperience: [{ schoolName: 'Example University of Hong Kong', schoolLocation: 'Hong Kong', degree: 'MSc in Data Science', startDate: '2020-09', endDate: '2022-06' }],
      },
      {
        sessionName: 'workExperience',
        headerName: 'WORK EXPERIENCE',
        experiences: [
          {
            jobTitle: 'Software Engineering Intern',
            companyName: 'Example Labs',
            location: 'Hong Kong',
            startDate: '2021-06',
            endDate: '2021-08',
            jobDescription: 'Built internal dashboards for the operations team.',
            features: [{ description: 'Cut report generation time from hours to minutes.' }],
            relatedSkills: ['TypeScript', 'React'],
          },
          { jobTitle: 'Backend Engineer', companyName: 'Example Cloud', location: 'Singapore', startDate: '2022-07', endDate: '2024-01', jobDescription: 'Ran the billing services in Go.' },
        ],
      },
      {
        sessionName: 'patents',
        headerName: 'PATENTS',
        patentExperience: [{ title: 'Co-Inventor, 2 Patent Applications', organization: 'Example Devices Ltd.', patents: ['Folding Hinge Structure (Invention Patent)', 'Cable Clip for Headsets (Utility Model)'] }],
      },
      { sessionName: 'extraSkill', headerName: 'LANGUAGE SKILLS', points: ['English: Fluent', 'Cantonese: Native'] },
    ],
    zh: [
      { sessionName: 'personalInformation', firstName: '示例', lastName: '人' },
      {
        sessionName: 'education',
        headerName: '教育经历',
        educationExperience: [{ schoolName: '香港示例大学', schoolLocation: '中国香港', degree: '数据科学理学硕士', startDate: '2020-09', endDate: '2022-06' }],
      },
      {
        sessionName: 'workExperience',
        headerName: '工作经历',
        experiences: [
          {
            jobTitle: '软件工程实习生',
            companyName: 'Example Labs',
            location: '中国香港',
            startDate: '2021-06',
            endDate: '2021-08',
            jobDescription: '为运营团队开发内部数据看板。',
            features: [{ description: '把报表生成时间从数小时缩短到几分钟。' }],
            relatedSkills: ['TypeScript', 'React'],
          },
          { jobTitle: '后端工程师', companyName: 'Example Cloud', location: '新加坡', startDate: '2022-07', endDate: '2024-01', jobDescription: '用 Go 维护计费服务。' },
        ],
      },
      {
        sessionName: 'patents',
        headerName: '专利',
        patentExperience: [{ title: '共同发明人，2 项专利申请', organization: '示例设备有限公司', patents: ['折叠铰链结构（发明专利）', '耳机线夹（实用新型）'] }],
      },
      { sessionName: 'extraSkill', headerName: '语言能力', points: ['英语：流利', '粤语：母语'] },
    ],
  },
  'cv',
)

export const ALIGNED = cvAlignment(CV.en, CV.zh)
export const POST: SearchDocLike = {
  kind: 'post',
  title: 'Notes on edge sorting',
  href: '/blog/edge-sorting',
  lang: 'en',
  body: 'We trained a small vision model and learned that the conveyor, not the model, was the hard part.',
  tags: ['Computer Vision'],
}
export const PAPER: SearchDocLike = { kind: 'publication', title: 'A Study of Example Sorting', href: '/publications#example2026', lang: 'en', description: 'Workshop paper on sorting conveyors, under review.' }
export const DOCS = parseSearchIndex({
  v: 2,
  subject: ['example', 'person', '示例人'],
  docs: [...cvSearchDocs(CV.en, 'en', ALIGNED), ...cvSearchDocs(CV.zh, 'zh', ALIGNED), POST, PAPER, { kind: 'cv', title: 'Off-site', href: '//evil.example/x' }],
})
export const SUBJECT = DOCS.subject
