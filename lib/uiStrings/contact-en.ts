import { ASK_ENTRY_EN, type AskEntryStrings } from './askEntry'
import { AVAILABILITY_EN, type AvailabilityStrings } from './availability'

/**
 * The English words of /contact (F3): the contact components' defaults.
 * Kept apart from ./contact (the Chinese tables and contactUiFor) so a page
 * that bundles the contact form or the availability card — /contact, the
 * home page's contact band — carries only English; a Chinese page receives
 * its words with its props (lib/contactPage). `{name}` marks a value filled
 * in with fillUi.
 */

/** The form's built-in reasons (lib/inquiry DEFAULT_REASONS), by their English name. */
export type DefaultReasonNames = Readonly<Record<'Project Inquiry' | 'Hiring' | 'Collaboration' | 'Consulting' | 'Mentorship' | 'Other', string>>

type FieldCopy = { label: string; placeholder?: string }
type IntentFieldCopy = { company: FieldCopy; roleUrl: FieldCopy; timeline: FieldCopy }

export type ContactStrings = {
  page: {
    title: string
    /** {name}: the owner. */
    description: string
    jsonLdName: string
    home: string
    eyebrow: string
    heading: string
    /** The lede when the owner wrote no blurb. */
    fallbackLede: string
  }
  panel: {
    eyebrow: string
    blurb: string
    heading: string
    email: string
    tel: string
    copyEmail: string
    emailCopied: string
    copyPhone: string
    phoneCopied: string
    saveVcf: string
    qrLabel: string
    scanToSave: string
    elsewhere: string
    newTab: string
  }
  form: {
    title: string
    name: string
    namePlaceholder: string
    email: string
    emailPlaceholder: string
    reason: string
    subject: string
    optional: string
    subjectPlaceholder: string
    message: string
    messagePlaceholder: string
    /** "· optional" after a disclosed group's title. */
    optionalGroup: string
    notSure: string
    workAuth: string
    humanCheck: string
    /** {a} + {b}. */
    whatIs: string
    loading: string
    ok: string
    send: string
    sending: string
    clear: string
    mailApp: string
  }
  reasons: DefaultReasonNames
  disclosure: {
    role: string
    freelance: string
    collab: string
    /** {fields}: the labels, joined. */
    added: string
    none: string
  }
  fields: { role: IntentFieldCopy; freelance: IntentFieldCopy; collab: IntentFieldCopy }
  timelines: { asap: string; 'within-1m': string; '1-3m': string; '3m-plus': string; flexible: string }
  errors: {
    name: string
    emailMissing: string
    emailBad: string
    subject: string
    message: string
    /** {max}. */
    messageLong: string
    mathLoading: string
    mathMissing: string
    mathWrong: string
    link: string
    linkLong: string
    nonce: string
    refreshed: string
    sendFailed: string
    network: string
    /** What the server's answer `code` means (pages/api/contact); unknown codes fall back to sendFailed. */
    codes: Readonly<Record<string, string>>
  }
  hint: {
    /** {list}. */
    template: string
    and: string
    sep: string
    labels: { name: string; email: string; subject: string; roleUrl: string; message: string; mathAnswer: string }
  }
  prefill: { kept: string; added: string }
  sent: {
    title: string
    /** {name} (", Ada" or ""), {subject}, {email}. */
    body: string
    nameSep: string
    whileYouWait: string
    readCv: string
    seeCv: string
    bookCall: string
    sendAnother: string
  }
  privacy: {
    what: string
    manual: string
    /** {period}. */
    auto: string
    link: string
    periods: { day: string; days: string; month: string; months: string; year: string; years: string }
  }
  /** The availability card (lib/uiStrings/availability). */
  availability: AvailabilityStrings
  ask: AskEntryStrings
}

export const CONTACT_EN: ContactStrings = {
  page: {
    title: 'Contact',
    description: 'Get in touch with {name}, a software engineer in Hong Kong: send a message, write an e-mail or save the contact card.',
    jsonLdName: 'Contact — {name}',
    home: 'Home',
    eyebrow: 'Contact',
    heading: 'Get in touch',
    fallbackLede: 'Questions, roles or collaborations: send a note.',
  },
  panel: {
    eyebrow: 'Reach me',
    blurb: 'I usually reply within 24 hours.',
    heading: 'Contact',
    email: 'email',
    tel: 'tel',
    copyEmail: 'Copy email address',
    emailCopied: 'Email copied',
    copyPhone: 'Copy phone number',
    phoneCopied: 'Phone number copied',
    saveVcf: 'Save contact (.vcf)',
    qrLabel: 'QR code that saves this contact',
    scanToSave: 'Scan to save contact',
    elsewhere: 'Elsewhere',
    newTab: ' (opens in a new tab)',
  },
  form: {
    title: 'Send a message',
    name: 'Name',
    namePlaceholder: 'Your name',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    reason: 'Reason',
    subject: 'Subject',
    optional: '(optional)',
    subjectPlaceholder: 'Subject',
    message: 'Message',
    messagePlaceholder: 'Tell me a bit more…',
    optionalGroup: '· optional',
    notSure: 'Not sure / skip',
    workAuth: 'work authorisation',
    humanCheck: 'human check',
    whatIs: 'What is {a} + {b}?',
    loading: 'Loading…',
    ok: 'ok',
    send: 'Send message',
    sending: 'Sending…',
    clear: 'Clear',
    mailApp: 'Use mail app',
  },
  reasons: {
    'Project Inquiry': 'Project Inquiry',
    Hiring: 'Hiring',
    Collaboration: 'Collaboration',
    Consulting: 'Consulting',
    Mentorship: 'Mentorship',
    Other: 'Other',
  },
  disclosure: {
    role: 'About the role',
    freelance: 'About the project',
    collab: 'About the collaboration',
    added: 'Added optional fields: {fields}.',
    none: 'No extra fields for this reason.',
  },
  fields: {
    role: {
      company: { label: 'Company', placeholder: 'Who is hiring' },
      roleUrl: { label: 'Job posting link', placeholder: 'https://…' },
      timeline: { label: 'Ideal start' },
    },
    freelance: {
      company: { label: 'Company or organisation', placeholder: 'Who the project is for' },
      roleUrl: { label: 'Brief or project link', placeholder: 'https://…' },
      timeline: { label: 'Timeline' },
    },
    collab: {
      company: { label: 'Organisation or project', placeholder: 'Who you are working with' },
      roleUrl: { label: 'Link', placeholder: 'https://…' },
      timeline: { label: 'Timeline' },
    },
  },
  timelines: {
    asap: 'As soon as possible',
    'within-1m': 'Within a month',
    '1-3m': 'In 1–3 months',
    '3m-plus': 'In 3 months or later',
    flexible: 'Flexible / not sure yet',
  },
  errors: {
    name: 'Please enter your name.',
    emailMissing: 'Please enter your email address.',
    emailBad: 'That email address doesn’t look right.',
    subject: 'Add a subject or pick a reason.',
    message: 'Please write a message.',
    messageLong: 'Keep the message under {max} characters.',
    mathLoading: 'The human check is still loading.',
    mathMissing: 'Answer the human check.',
    mathWrong: 'That sum isn’t right — try again.',
    link: 'The link must be a full https:// address.',
    linkLong: 'This link is too long — paste a shorter link to the same page.',
    nonce: 'Verification couldn’t start — check your connection and try again.',
    refreshed: 'The human check was refreshed — please answer the new sum.',
    sendFailed: 'The message couldn’t be sent. Please try again.',
    network: 'Network error — check your connection and try again.',
    codes: {},
  },
  hint: {
    template: 'Add {list} to send.',
    and: ' and ',
    sep: ', ',
    labels: {
      name: 'your name',
      email: 'a valid email',
      subject: 'a subject',
      roleUrl: 'an https:// link (or leave it empty)',
      message: 'a message',
      mathAnswer: 'the human-check answer',
    },
  },
  prefill: {
    kept: 'Your earlier message is kept in the Message field; the question was not added.',
    added: 'Your question is in the Message field. Edit it or send it as it is.',
  },
  sent: {
    title: 'Message sent',
    body: 'Thanks{name} — your message about {subject} is on its way. I’ll reply to {email}.',
    nameSep: ', ',
    whileYouWait: 'While you wait',
    readCv: 'Read my CV',
    seeCv: 'See my CV',
    bookCall: 'Book a call',
    sendAnother: 'Send another message',
  },
  privacy: {
    what: 'Your name, e-mail address and message are kept in my private inbox (and may be forwarded to my own mailbox), only so I can reply.',
    manual: 'I delete them myself when they are no longer needed.',
    auto: 'They are deleted automatically after {period}.',
    link: 'How this site handles data',
    periods: { day: '1 day', days: '{n} days', month: '1 month', months: '{n} months', year: '12 months', years: '{n} years' },
  },
  availability: AVAILABILITY_EN,
  ask: ASK_ENTRY_EN,
}
