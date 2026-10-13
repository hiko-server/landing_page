/**
 * cv-docs E7: skill traceability (lib/skillEvidence.ts). Every skill the
 * public CV lists links to where it is evidenced — roles, projects, awards
 * and patents on the page, published case studies and posts — with strict
 * matching (word boundaries, aliases, case for short terms, tag-only
 * ambiguous names), no rows without evidence, and never a hidden entry.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import { aliasKeys, buildSkillEvidence, cvSkills, skillId, skillKey, skillLinkMap, EVIDENCE_KIND_LABELS } from '../lib/skillEvidence'

const skill = (core: string[], groups: Array<[string, string[]]> = []) => ({
  sessionName: 'skill',
  languages: core.map((language) => ({ language, level: '' })),
  technical: groups.map(([name, description]) => ({ name, description })),
})
const work = (items: Array<Record<string, unknown>>) => ({ sessionName: 'workExperience', experiences: items })
const project = (items: Array<Record<string, unknown>>) => ({ sessionName: 'project', projectExperience: items })
const awards = (items: Array<Record<string, unknown>>) => ({ sessionName: 'competitionAwards', awards: items })
const feat = (...texts: string[]) => texts.map((description) => ({ description, furtherExplanation: [] }))

const evidenceFor = (sections: any[], opts: Partial<Parameters<typeof buildSkillEvidence>[1]> = {}) =>
  Object.fromEntries(buildSkillEvidence(publicSections(sections, 'cv'), { lang: 'en', ...opts }).map((e) => [e.name, e.items.map((i) => `${i.kind}:${i.label}`)]))

test('skill keys ignore case, width, spacing and parenthesised notes; aliases and slash parts name the same skill', () => {
  assert.equal(skillKey('MongoDB (NoSQL)'), 'mongodb')
  assert.equal(skillKey('MongoDB（NoSQL）'), 'mongodb')
  assert.equal(skillKey('  Next.js  '), 'next.js')
  assert.equal(skillKey('Proficient.'), 'proficient')
  assert.ok(aliasKeys('react').includes('react.js'))
  assert.ok(aliasKeys('html5/css3').includes('css'))
  assert.ok(aliasKeys('openapi/swagger').includes('swagger'))
  assert.equal(skillId('c++'), 'skill-c-plus-plus')
  assert.equal(skillId('c#'), 'skill-c-sharp')
  assert.equal(skillId('next.js'), 'skill-next-js')
  assert.equal(skillId('机器学习'), 'skill-机器学习')
})

test('the CV’s skills: core skills, groups, then roles’ related skills — de-duplicated, first spelling kept', () => {
  const skills = cvSkills(
    publicSections([skill(['Python', 'MongoDB'], [['Backend', ['MongoDB (NoSQL)', 'Docker']]]), work([{ jobTitle: 'Dev', relatedSkills: ['python', 'IoT'] }])], 'cv'),
  )
  assert.deepEqual(skills.map((s) => s.name), ['Python', 'MongoDB', 'Docker', 'IoT'])
})

test('word boundaries: C is not CUHK or C++, Java is not JavaScript, Git is not GitHub', () => {
  const ev = evidenceFor([
    skill(['C', 'C++', 'Java', 'Git']),
    project([
      { title: 'Campus app', description: 'Studied at CUHK; wrote JavaScript and pushed it to GitHub.' },
      { title: 'Solver', description: 'Solved puzzles in C++ with Git hooks.' },
      { title: 'Backend', description: 'A Java service.' },
    ]),
  ])
  assert.deepEqual(ev['C++'], ['project:Solver'])
  assert.deepEqual(ev['Git'], ['project:Solver'])
  assert.deepEqual(ev['Java'], ['project:Backend'])
  assert.equal(ev['C'], undefined, '"C" is matched as a tag only — never in prose')
})

test('short terms keep their case ("AI" is not "said"), aliases match prose ("React.js", "Machine Learning" ↔ "ML")', () => {
  const ev = evidenceFor([
    skill(['AI', 'React', 'Machine Learning']),
    project([
      { title: 'Notes', description: 'He said it was fine.' },
      { title: 'Smart bin', description: 'AI-powered sorting with ML models.' },
      { title: 'Dashboard', description: 'Built with React.js and hooks.' },
    ]),
  ])
  assert.deepEqual(ev['AI'], ['project:Smart bin'])
  assert.deepEqual(ev['Machine Learning'], ['project:Smart bin'])
  assert.deepEqual(ev['React'], ['project:Dashboard'])
})

test('sources: role tags and text, projects, awards, case studies (tech) and posts (tags) — in that order, de-duplicated', () => {
  const ev = buildSkillEvidence(
    publicSections(
      [
        skill(['Python']),
        work([{ jobTitle: 'Intern', companyName: 'Acme', relatedSkills: ['Python'], features: feat('Wrote Python scripts.') }]),
        project([{ title: 'Scraper', features: feat('Python FastAPI backend.') }]),
        awards([{ contestName: 'Xtreme', description: ['Solved tasks in Python.'] }]),
      ],
      'cv',
    ),
    {
      lang: 'en',
      works: [{ slug: 'sorter', title: 'Sorter', tags: ['Python', 'YOLO'] }, { slug: 'other', title: 'Other', tags: ['Go'] }],
      posts: [{ slug: 'lessons', title: 'Lessons', description: 'What Python taught me' }],
    },
  )
  assert.equal(ev.length, 1)
  assert.deepEqual(
    ev[0].items.map((i) => [i.kind, i.label, i.href]),
    [
      ['role', 'Intern — Acme', '#cv-workExperience-0'],
      ['project', 'Scraper', '#cv-project-0'],
      ['award', 'Xtreme', '#cv-competitionAwards-0'],
      ['caseStudy', 'Sorter', '/work/sorter'],
      ['post', 'Lessons', '/blog/lessons'],
    ],
  )
  assert.equal(ev[0].id, 'skill-python')
})

test('no evidence → no row (never a "0"); certificates and education never count', () => {
  const ev = evidenceFor([
    skill(['Rust', 'Kotlin']),
    { sessionName: 'education', educationExperience: [{ schoolName: 'Rust University', degree: 'BSc Kotlin' }] },
    { sessionName: 'certification', certifications: [{ issuingOrganization: 'X', CertificationList: [{ certificationName: 'Kotlin Essentials' }] }] },
  ])
  assert.deepEqual(ev, {})
})

test('hidden entries and bullets are never cited', () => {
  const ev = evidenceFor([
    skill(['Docker']),
    project([
      { title: 'Secret', description: 'Docker everywhere', isVisible: false },
      { title: 'Visible', description: 'No containers.', features: feat('Docker compose setup'), hiddenItems: {} },
      { title: 'Masked', features: [{ description: 'Docker swarm', furtherExplanation: [], isVisible: false }] },
    ]),
  ])
  // "Secret" is gone; anchors follow the public list, so "Visible" is entry 0.
  assert.deepEqual(ev['Docker'], ['project:Visible'])
  const links = skillLinkMap(publicSections([skill(['Docker'])], 'cv'), buildSkillEvidence(publicSections([skill(['Docker']), project([{ title: 'A', description: 'Docker' }])], 'cv'), { lang: 'en' }))
  assert.deepEqual(links, { Docker: 'skill-docker' })
})

test('Chinese terms match as substrings; Chinese pages get Chinese kind labels', () => {
  const ev = buildSkillEvidence(
    publicSections([skill(['机器学习']), work([{ jobTitle: '工程师', companyName: '某公司', features: feat('负责机器学习模型训练。') }])], 'cv'),
    { lang: 'zh' },
  )
  assert.deepEqual(ev.map((e) => [e.name, e.items.map((i) => i.label)]), [['机器学习', ['工程师 · 某公司']]])
  assert.equal(EVIDENCE_KIND_LABELS.zh.caseStudy, '案例')
})

test('skill links map every spelling on the page to the row id', () => {
  const sections = publicSections([skill(['MongoDB'], [['DB', ['MongoDB (NoSQL)']]]), project([{ title: 'P', description: 'MongoDB schema' }])], 'cv')
  const ev = buildSkillEvidence(sections, { lang: 'en' })
  assert.deepEqual(skillLinkMap(sections, ev), { MongoDB: 'skill-mongodb', 'MongoDB (NoSQL)': 'skill-mongodb' })
})
