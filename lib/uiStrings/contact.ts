import { uiLangOf, type UiLang, type UiTable } from './index'
import { ASK_ENTRY_UI } from './askEntry'
import { CONTACT_EN, type ContactStrings } from './contact-en'

export { CONTACT_EN } from './contact-en'
export type { ContactStrings, DefaultReasonNames } from './contact-en'

/**
 * /contact and /zh/contact (F3) in each interface language (lib/uiStrings):
 * the page, the reach-me panel, the message form with its validation, its
 * structured inquiry fields and its privacy notice, the confirmation and
 * the availability card (also on the home page). `{name}` marks a value
 * filled in with fillUi.
 *
 * The English words are the components' defaults (CONTACT_EN, in
 * ./contact-en so the components bundle no other language); a page in
 * another language ships its own with its props (contactUiFor). The owner's
 * own copy (heading, blurb, eyebrow, reasons, availability) is never here:
 * it comes from the Home editor, in Chinese from its Chinese fields.
 */

type ContactTables = Omit<ContactStrings, 'ask'>

const ZH_HANS: ContactTables = {
  page: {
    title: '联系',
    description: '与{name}联系：在线留言、发送电子邮件或保存联系人名片。',
    jsonLdName: '联系 — {name}',
    home: '首页',
    eyebrow: '联系',
    heading: '与我联系',
    fallbackLede: '无论是问题、职位机会还是合作，都欢迎留言。',
  },
  panel: {
    eyebrow: '联系方式',
    blurb: '我通常会在 24 小时内回复。',
    heading: '联系',
    email: '邮箱',
    tel: '电话',
    copyEmail: '复制电子邮件地址',
    emailCopied: '电子邮件地址已复制',
    copyPhone: '复制电话号码',
    phoneCopied: '电话号码已复制',
    saveVcf: '保存联系人（.vcf）',
    qrLabel: '扫码保存联系人的二维码',
    scanToSave: '扫码保存联系人',
    elsewhere: '其他平台',
    newTab: '（在新标签页中打开）',
  },
  form: {
    title: '在线留言',
    name: '姓名',
    namePlaceholder: '你的姓名',
    email: '电子邮件',
    emailPlaceholder: 'you@example.com',
    reason: '事由',
    subject: '主题',
    optional: '（选填）',
    subjectPlaceholder: '主题',
    message: '留言',
    messagePlaceholder: '多说几句吧…',
    optionalGroup: '· 选填',
    notSure: '还不确定 / 跳过',
    workAuth: '工作许可',
    humanCheck: '人机验证',
    whatIs: '{a} + {b} 等于多少？',
    loading: '正在加载…',
    ok: '正确',
    send: '发送留言',
    sending: '正在发送…',
    clear: '清空',
    mailApp: '用邮件应用发送',
  },
  reasons: {
    'Project Inquiry': '项目咨询',
    Hiring: '招聘',
    Collaboration: '合作',
    Consulting: '顾问咨询',
    Mentorship: '指导交流',
    Other: '其他',
  },
  disclosure: {
    role: '关于这个职位',
    freelance: '关于这个项目',
    collab: '关于这次合作',
    added: '已添加选填项：{fields}。',
    none: '这个事由没有额外的选填项。',
  },
  fields: {
    role: {
      company: { label: '公司', placeholder: '招聘方' },
      roleUrl: { label: '职位链接', placeholder: 'https://…' },
      timeline: { label: '理想入职时间' },
    },
    freelance: {
      company: { label: '公司或机构', placeholder: '项目的委托方' },
      roleUrl: { label: '需求或项目链接', placeholder: 'https://…' },
      timeline: { label: '时间安排' },
    },
    collab: {
      company: { label: '机构或项目', placeholder: '你所在的团队或项目' },
      roleUrl: { label: '链接', placeholder: 'https://…' },
      timeline: { label: '时间安排' },
    },
  },
  timelines: {
    asap: '越快越好',
    'within-1m': '一个月内',
    '1-3m': '1–3 个月内',
    '3m-plus': '3 个月或更晚',
    flexible: '灵活 / 尚未确定',
  },
  errors: {
    name: '请填写你的姓名。',
    emailMissing: '请填写你的电子邮件地址。',
    emailBad: '这个电子邮件地址看起来不太对。',
    subject: '请填写主题，或选择一个事由。',
    message: '请写下留言内容。',
    messageLong: '留言请控制在 {max} 个字符以内。',
    mathLoading: '人机验证仍在加载。',
    mathMissing: '请回答人机验证。',
    mathWrong: '这个答案不对，请再试一次。',
    link: '链接必须是完整的 https:// 地址。',
    linkLong: '这个链接太长了，请粘贴同一页面的较短链接。',
    nonce: '无法开始验证，请检查网络后重试。',
    refreshed: '人机验证已刷新，请回答新的题目。',
    sendFailed: '留言未能发出，请再试一次。',
    network: '网络错误，请检查网络后重试。',
    codes: {
      RATE_LIMITED: '短时间内发送太多次了，请稍后再试。',
      MISSING_FIELDS: '请填写姓名、电子邮件、主题和留言。',
      TOKEN_MISSING: '验证未完成，请刷新页面后重试。',
      TOKEN_INVALID: '验证无效，请刷新页面后重试。',
      TOKEN_EXPIRED: '验证已过期，请刷新表单后重试。',
      TOO_FAST: '请稍等片刻再发送。',
      CHALLENGE_MISSING: '请完成人机验证。',
      BAD_CHALLENGE: '人机验证的答案不对，已换了一道新题。',
      BAD_EMAIL: '请填写有效的电子邮件地址。',
      BAD_LINK: '链接必须是完整的 https:// 地址，且不能太长。',
      BUSY: '收件箱收到的留言异常多，正在短暂休息。请稍后再试，或直接发送电子邮件。',
      UNAVAILABLE: '留言暂时无法送达，请稍后再试，或直接发送电子邮件。',
    },
  },
  hint: {
    template: '请填写{list}后再发送。',
    and: '和',
    sep: '、',
    labels: {
      name: '姓名',
      email: '有效的电子邮件',
      subject: '主题',
      roleUrl: 'https:// 链接（或留空）',
      message: '留言',
      mathAnswer: '人机验证答案',
    },
  },
  prefill: {
    kept: '你之前写的留言保留在“留言”栏中，问题没有加进去。',
    added: '你的问题已填入“留言”栏，可以修改，也可以直接发送。',
  },
  sent: {
    title: '留言已发送',
    body: '谢谢{name}！你关于{subject}的留言已经发出，我会回复到 {email}。',
    nameSep: '，',
    whileYouWait: '等待回复时',
    readCv: '看看我的简历',
    seeCv: '看看我的简历',
    bookCall: '预约通话',
    sendAnother: '再写一封留言',
  },
  privacy: {
    what: '你的姓名、电子邮件地址和留言会保存在我的私人收件箱中（也可能转发到我自己的邮箱），只用于回复你。',
    manual: '不再需要时，我会亲自删除。',
    auto: '它们会在 {period}后自动删除。',
    link: '本站如何处理数据',
    periods: { day: '1 天', days: '{n} 天', month: '1 个月', months: '{n} 个月', year: '12 个月', years: '{n} 年' },
  },
  availability: {
    open: '可以承接新工作',
    limited: '档期有限',
    closed: '暂不承接新工作',
    from: '{date} 起',
    workAuth: '工作许可',
    roles: '意向职位',
    bookCall: '预约通话',
    newTab: '（在新标签页中打开）',
  },
}

const ZH_HANT: ContactTables = {
  page: {
    title: '聯絡',
    description: '與{name}聯絡：在線留言、發送電子郵件或儲存聯絡人名片。',
    jsonLdName: '聯絡 — {name}',
    home: '首頁',
    eyebrow: '聯絡',
    heading: '與我聯絡',
    fallbackLede: '無論是問題、職位機會還是合作，都歡迎留言。',
  },
  panel: {
    eyebrow: '聯絡方式',
    blurb: '我通常會在 24 小時內回覆。',
    heading: '聯絡',
    email: '電郵',
    tel: '電話',
    copyEmail: '複製電子郵件地址',
    emailCopied: '電子郵件地址已複製',
    copyPhone: '複製電話號碼',
    phoneCopied: '電話號碼已複製',
    saveVcf: '儲存聯絡人（.vcf）',
    qrLabel: '掃碼儲存聯絡人的二維碼',
    scanToSave: '掃碼儲存聯絡人',
    elsewhere: '其他平台',
    newTab: '（在新分頁中開啟）',
  },
  form: {
    title: '在線留言',
    name: '姓名',
    namePlaceholder: '你的姓名',
    email: '電子郵件',
    emailPlaceholder: 'you@example.com',
    reason: '事由',
    subject: '主題',
    optional: '（選填）',
    subjectPlaceholder: '主題',
    message: '留言',
    messagePlaceholder: '多說幾句吧…',
    optionalGroup: '· 選填',
    notSure: '還不確定 / 略過',
    workAuth: '工作許可',
    humanCheck: '人機驗證',
    whatIs: '{a} + {b} 等於多少？',
    loading: '正在載入…',
    ok: '正確',
    send: '發送留言',
    sending: '正在發送…',
    clear: '清空',
    mailApp: '用郵件應用程式發送',
  },
  reasons: {
    'Project Inquiry': '項目查詢',
    Hiring: '招聘',
    Collaboration: '合作',
    Consulting: '顧問諮詢',
    Mentorship: '指導交流',
    Other: '其他',
  },
  disclosure: {
    role: '關於這個職位',
    freelance: '關於這個項目',
    collab: '關於這次合作',
    added: '已加入選填項：{fields}。',
    none: '這個事由沒有額外的選填項。',
  },
  fields: {
    role: {
      company: { label: '公司', placeholder: '招聘方' },
      roleUrl: { label: '職位連結', placeholder: 'https://…' },
      timeline: { label: '理想入職時間' },
    },
    freelance: {
      company: { label: '公司或機構', placeholder: '項目的委託方' },
      roleUrl: { label: '需求或項目連結', placeholder: 'https://…' },
      timeline: { label: '時間安排' },
    },
    collab: {
      company: { label: '機構或項目', placeholder: '你所在的團隊或項目' },
      roleUrl: { label: '連結', placeholder: 'https://…' },
      timeline: { label: '時間安排' },
    },
  },
  timelines: {
    asap: '越快越好',
    'within-1m': '一個月內',
    '1-3m': '1–3 個月內',
    '3m-plus': '3 個月或更晚',
    flexible: '靈活 / 尚未確定',
  },
  errors: {
    name: '請填寫你的姓名。',
    emailMissing: '請填寫你的電子郵件地址。',
    emailBad: '這個電子郵件地址看起來不太對。',
    subject: '請填寫主題，或選擇一個事由。',
    message: '請寫下留言內容。',
    messageLong: '留言請控制在 {max} 個字元以內。',
    mathLoading: '人機驗證仍在載入。',
    mathMissing: '請回答人機驗證。',
    mathWrong: '這個答案不對，請再試一次。',
    link: '連結必須是完整的 https:// 地址。',
    linkLong: '這個連結太長了，請貼上同一頁面的較短連結。',
    nonce: '無法開始驗證，請檢查網絡後重試。',
    refreshed: '人機驗證已更新，請回答新的題目。',
    sendFailed: '留言未能發出，請再試一次。',
    network: '網絡錯誤，請檢查網絡後重試。',
    codes: {
      RATE_LIMITED: '短時間內發送太多次了，請稍後再試。',
      MISSING_FIELDS: '請填寫姓名、電子郵件、主題和留言。',
      TOKEN_MISSING: '驗證未完成，請重新整理頁面後重試。',
      TOKEN_INVALID: '驗證無效，請重新整理頁面後重試。',
      TOKEN_EXPIRED: '驗證已過期，請重新整理表單後重試。',
      TOO_FAST: '請稍等片刻再發送。',
      CHALLENGE_MISSING: '請完成人機驗證。',
      BAD_CHALLENGE: '人機驗證的答案不對，已換了一道新題。',
      BAD_EMAIL: '請填寫有效的電子郵件地址。',
      BAD_LINK: '連結必須是完整的 https:// 地址，且不能太長。',
      BUSY: '收件箱收到的留言異常多，正在短暫休息。請稍後再試，或直接發送電子郵件。',
      UNAVAILABLE: '留言暫時無法送達，請稍後再試，或直接發送電子郵件。',
    },
  },
  hint: {
    template: '請填寫{list}後再發送。',
    and: '和',
    sep: '、',
    labels: {
      name: '姓名',
      email: '有效的電子郵件',
      subject: '主題',
      roleUrl: 'https:// 連結（或留空）',
      message: '留言',
      mathAnswer: '人機驗證答案',
    },
  },
  prefill: {
    kept: '你之前寫的留言保留在「留言」欄中，問題沒有加進去。',
    added: '你的問題已填入「留言」欄，可以修改，也可以直接發送。',
  },
  sent: {
    title: '留言已發送',
    body: '謝謝{name}！你關於{subject}的留言已經發出，我會回覆到 {email}。',
    nameSep: '，',
    whileYouWait: '等待回覆時',
    readCv: '看看我的履歷',
    seeCv: '看看我的履歷',
    bookCall: '預約通話',
    sendAnother: '再寫一封留言',
  },
  privacy: {
    what: '你的姓名、電子郵件地址和留言會儲存在我的私人收件箱中（也可能轉發到我自己的郵箱），只用於回覆你。',
    manual: '不再需要時，我會親自刪除。',
    auto: '它們會在 {period}後自動刪除。',
    link: '本站如何處理數據',
    periods: { day: '1 天', days: '{n} 天', month: '1 個月', months: '{n} 個月', year: '12 個月', years: '{n} 年' },
  },
  availability: {
    open: '可以承接新工作',
    limited: '檔期有限',
    closed: '暫不承接新工作',
    from: '{date} 起',
    workAuth: '工作許可',
    roles: '意向職位',
    bookCall: '預約通話',
    newTab: '（在新分頁中開啟）',
  },
}

export const CONTACT_UI: UiTable<ContactStrings> = {
  en: CONTACT_EN,
  'zh-Hans': { ...ZH_HANS, ask: ASK_ENTRY_UI['zh-Hans'] },
  'zh-Hant': { ...ZH_HANT, ask: ASK_ENTRY_UI['zh-Hant'] },
}

/** The words a contact page needs, in its language (getStaticProps → props.ui). */
export type ContactUi = { lang: UiLang; t: ContactStrings }

export function contactUiFor(pageLang: string | undefined | null): ContactUi {
  const lang = uiLangOf(pageLang)
  return { lang, t: CONTACT_UI[lang] }
}
