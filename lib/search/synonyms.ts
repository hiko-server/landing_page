/**
 * Recruiter vocabulary for search and "Ask": groups of words that ask for the
 * same thing, in English and Chinese, so "internship" finds 实习, "专利"
 * finds "Patent" and "Where did he study?" finds the Education section.
 *
 * Generic terms only — no fact about the owner lives here. `sections` names
 * the topics a broad group asks about (specific facts — a degree, a GPA —
 * have none: they are answered only where they are written) — CV sections (sessionName) or
 * 'availability' (the owner's availability on /contact): a passage of that
 * topic answers the question even when it never uses the word ("Has he won
 * any awards?" → every Competitions & Awards entry).
 *
 * English terms are written as plain words / phrases (they are stemmed when
 * the tables are built); Chinese terms as written.
 */

export type SynonymGroup = {
  id: string
  terms: readonly string[]
  sections?: readonly string[]
  /**
   * Words that find the group when typed but never stand in for another
   * word, because they mean something else too ("paper" in "waste paper",
   * 认证 in 身份认证 — authentication). Lone CJK characters are treated so
   * as well (lib/search/query).
   */
  ambiguous?: readonly string[]
}

export const SYNONYM_GROUPS: readonly SynonymGroup[] = [
  {
    id: 'patent',
    terms: ['patent', 'patents', 'patented', 'inventor', 'inventors', 'invention', 'inventions', 'co-inventor', 'utility model', 'intellectual property', '专利', '发明', '发明人', '发明专利', '实用新型', '知识产权'],
    sections: ['patents'],
  },
  { id: 'intern', terms: ['intern', 'interns', 'internship', 'internships', 'trainee', 'placement', '实习', '实习生', '见习'] },
  {
    id: 'work',
    terms: ['experience', 'work experience', 'job', 'jobs', 'employment', 'employer', 'employers', 'career', 'role', 'roles', 'position', 'positions', 'worked', 'company', 'companies', '工作', '工作经历', '经历', '经验', '职位', '任职', '就职', '公司', '雇主'],
    sections: ['workExperience'],
  },
  {
    id: 'education',
    terms: ['education', 'study', 'studied', 'studies', 'school', 'schools', 'university', 'universities', 'college', 'degree', 'degrees', 'graduate', 'graduated', 'graduation', 'alma mater', 'academic', 'student', '教育', '教育经历', '学历', '学位', '大学', '学校', '院校', '毕业', '就读', '读书', '读', '专业', '学生', '念书'],
    sections: ['education'],
  },
  // Specific facts, not topics: a degree or a GPA is answered only where it is written.
  { id: 'master', terms: ['master', 'masters', "master's", 'msc', 'mphil', 'postgraduate', '硕士', '研究生'] },
  { id: 'bachelor', terms: ['bachelor', 'bachelors', "bachelor's", 'bsc', 'beng', 'undergraduate', 'honours', '学士', '本科', '荣誉学士'] },
  { id: 'phd', terms: ['phd', 'doctorate', 'doctoral', '博士'] },
  { id: 'gpa', terms: ['gpa', 'grade', 'grades', 'cgpa', '绩点', '成绩'] },
  {
    id: 'award',
    terms: ['award', 'awards', 'awarded', 'prize', 'prizes', 'winner', 'won', 'win', 'competition', 'competitions', 'contest', 'contests', 'hackathon', 'ranked', 'ranking', '奖', '奖项', '获奖', '得奖', '比赛', '竞赛', '大赛', '名次', '排名'],
    sections: ['competitionAwards'],
  },
  {
    id: 'certification',
    terms: ['certification', 'certifications', 'certificate', 'certificates', 'certified', 'credential', 'credentials', '证书', '资格证', '资格证书', '执照'],
    sections: ['certification'],
    ambiguous: ['license', 'licence', '认证'],
  },
  {
    id: 'skill',
    terms: ['skill', 'skills', 'tech stack', 'stack', 'technology', 'technologies', 'tools', 'tooling', 'proficient', 'proficiency', 'expertise', 'programming', '技能', '技术', '技术栈', '工具', '擅长', '熟练', '精通', '编程'],
    sections: ['skill'],
  },
  {
    id: 'programming-language',
    terms: ['programming language', 'programming languages', 'coding language', 'coding languages', '编程语言', '程序语言', '开发语言', '程序设计语言'],
    sections: ['skill'],
  },
  {
    id: 'spoken',
    terms: ['spoken language', 'spoken languages', 'speak', 'speaks', 'fluent', 'fluency', 'native', 'bilingual', 'mother tongue', '语言能力', '母语', '外语', '会说', '说', '讲', '流利'],
    sections: ['extraSkill'],
  },
  { id: 'cantonese', terms: ['cantonese', '粤语', '广东话'] },
  { id: 'mandarin', terms: ['mandarin', 'putonghua', '普通话', '国语'] },
  { id: 'english', terms: ['english', '英语', '英文', 'ielts', 'toefl', '雅思', '托福'] },
  { id: 'project', terms: ['project', 'projects', 'portfolio', 'side project', 'built', 'build', '项目', '项目经历', '作品', '作品集'], sections: ['project'] },
  {
    id: 'publication',
    terms: ['publication', 'publications', 'publish', 'published', 'journal', 'conference paper', 'preprint', 'thesis', 'dissertation', '论文', '发表', '期刊', '会议论文', '学位论文', '出版'],
    sections: ['publications'],
    ambiguous: ['paper', 'papers', 'conference'],
  },
  { id: 'research', terms: ['research', 'researcher', 'researching', 'lab', 'laboratory', '研究', '研究员', '科研', '实验室'] },
  { id: 'founder', terms: ['founder', 'co-founder', 'cofounder', 'founded', 'startup', 'start-up', 'startups', 'entrepreneur', 'entrepreneurship', 'entrepreneurial', 'venture', '创始人', '联合创始人', '创业', '初创', '创办'] },
  { id: 'cto', terms: ['cto', 'chief technology officer', '首席技术官', '技术总监', '技术负责人'] },
  { id: 'engineer', terms: ['engineer', 'engineers', 'developer', 'developers', 'programmer', 'software engineer', 'software developer', '工程师', '开发者', '开发人员', '程序员', '软件工程师'] },
  { id: 'frontend', terms: ['frontend', 'front-end', 'front end', '前端'] },
  { id: 'backend', terms: ['backend', 'back-end', 'back end', 'server-side', '后端', '服务端'] },
  { id: 'fullstack', terms: ['full-stack', 'fullstack', 'full stack', '全栈'] },
  {
    id: 'ai',
    terms: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'neural network', 'neural networks', 'llm', 'llms', '人工智能', '机器学习', '深度学习', '神经网络', '大模型', '大语言模型'],
  },
  { id: 'vision', terms: ['computer vision', 'machine vision', 'image recognition', 'object detection', '计算机视觉', '机器视觉', '视觉识别', '图像识别', '目标检测'] },
  { id: 'robot', terms: ['robot', 'robots', 'robotics', '机器人'] },
  { id: 'iot', terms: ['iot', 'internet of things', '物联网'] },
  { id: 'embedded', terms: ['embedded', 'firmware', 'microcontroller', '嵌入式', '固件', '单片机'] },
  { id: 'cloud', terms: ['cloud', 'cloud computing', '云', '云计算', '云端'] },
  { id: 'database', terms: ['database', 'databases', 'sql', 'nosql', '数据库'] },
  { id: 'security', terms: ['security', 'cybersecurity', 'cyber security', '安全', '网络安全', '信息安全'] },
  { id: 'testing', terms: ['testing', 'test', 'tests', 'qa', 'quality assurance', '测试', '质量保证'] },
  { id: 'lead', terms: ['lead', 'leader', 'leadership', 'led', 'manage', 'managed', 'management', 'manager', 'team', 'teams', '领导', '带领', '管理', '团队', '主导', '负责'] },
  { id: 'funding', terms: ['funding', 'funded', 'grant', 'grants', 'investment', 'raised', 'seed', '资金', '资助', '融资', '奖金'] },
  { id: 'remote', terms: ['remote', 'remotely', '远程'] },
  { id: 'hobby', terms: ['hobby', 'hobbies', 'interests', 'free time', 'pastime', '爱好', '兴趣', '业余'] },
  { id: 'volunteer', terms: ['volunteer', 'volunteering', 'volunteered', '志愿', '志愿者', '义工'] },
  { id: 'cv', terms: ['cv', 'resume', 'résumé', 'curriculum vitae', '简历', '履历'] },
  { id: 'writing', terms: ['blog', 'post', 'posts', 'article', 'articles', 'essay', 'essays', '文章', '博客', '随笔'] },
  { id: 'contact', terms: ['contact', 'email', 'e-mail', 'reach', 'hire', 'hiring', '联系', '联系方式', '邮箱', '邮件', '招聘', '聘请'] },
  {
    id: 'availability',
    terms: ['available', 'availability', 'open to work', 'open to opportunities', 'start date', 'notice period', '找工作', '到岗', '可入职', '入职', '求职意向'],
    sections: ['availability'],
  },
  // Places recruiters ask about (generic names in both languages).
  { id: 'hongkong', terms: ['hong kong', 'hk', 'hksar', '香港', '中国香港'] },
  { id: 'china', terms: ['china', 'mainland china', 'prc', '中国', '内地', '中国大陆'] },
  { id: 'shenzhen', terms: ['shenzhen', '深圳'] },
  { id: 'guangzhou', terms: ['guangzhou', '广州'] },
  { id: 'dongguan', terms: ['dongguan', '东莞'] },
  { id: 'shanghai', terms: ['shanghai', '上海'] },
  { id: 'beijing', terms: ['beijing', '北京'] },
  { id: 'macau', terms: ['macau', 'macao', '澳门'] },
  { id: 'taiwan', terms: ['taiwan', '台湾'] },
  { id: 'singapore', terms: ['singapore', '新加坡'] },
  { id: 'japan', terms: ['japan', 'japanese', '日本'] },
  { id: 'korea', terms: ['korea', 'korean', '韩国'] },
  { id: 'germany', terms: ['germany', 'german', '德国'] },
  { id: 'uk', terms: ['united kingdom', 'uk', 'britain', 'england', '英国'] },
  { id: 'usa', terms: ['united states', 'usa', 'america', 'american', '美国'] },
  { id: 'canada', terms: ['canada', '加拿大'] },
  { id: 'australia', terms: ['australia', '澳大利亚', '澳洲'] },
  { id: 'europe', terms: ['europe', 'european', '欧洲'] },
]
