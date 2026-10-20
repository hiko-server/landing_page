import { isPlainEmail } from './inboxReply'
import { checkFromAlignment, checkReplyAlignment, notificationFrom, replyFrom, smtpConfigured, type ReplyFromSource } from './mailAlignment'

export { checkFromAlignment, checkReplyAlignment, notificationFrom, replyFrom, smtpConfigured }

/**
 * Who a reply from the admin Inbox comes from (SERVER-ONLY).
 *
 * A reply is sent FROM the SMTP account's own address — the address the
 * mail provider signs (DKIM) and is allowed to send for (SPF), so it passes
 * the recipient's DMARC check — with Reply-To set to the owner's public
 * address, so the visitor's answer still reaches the owner. Sending from the
 * site's domain through a third-party SMTP service would fail DMARC there
 * when the domain publishes p=reject (lucian-dev.com does) and the
 * recruiter's server would refuse the reply.
 *
 *   From      REPLY_FROM_EMAIL, else SMTP_USER when it is an address, else FROM_EMAIL
 *   Reply-To  the e-mail address the site shows (Home → hero e-mail, else the
 *             public CV's), else none
 *
 * checkReplyAlignment() (lib/mailAlignment) looks up the From domain's DMARC policy (cached for
 * an hour) and warns when the From domain is not the SMTP account's own and
 * the policy would reject or quarantine an unaligned message.
 */

export type MailIdentity = {
  /** SMTP_HOST, SMTP_USER and SMTP_PASS are set. */
  smtp: boolean
  smtpHost: string | null
  /** The address replies are sent from (null without SMTP). */
  from: string | null
  fromSource: ReplyFromSource
  /** The owner's public address (Reply-To), when the site shows one. */
  replyTo: string | null
  /** The owner's public name in each language, for the display name and the sign-off. */
  ownerName: { en: string; zh: string }
}

const env = (name: string) => (process.env[name] || '').trim()

/** The address and names the public site shows (best effort; failures give nulls). */
async function publicOwner(): Promise<{ email: string | null; name: { en: string; zh: string } }> {
  const out = { email: null as string | null, name: { en: '', zh: '' } }
  try {
    const { readPublicHome } = await import('./home')
    const email = (readPublicHome()?.hero?.email || '').trim()
    if (isPlainEmail(email)) out.email = email
  } catch {
    /* no home document */
  }
  try {
    const { readCvData, readPublicCvSections } = await import('./cvdata')
    const { field } = await import('../components/CVViewerPage/fields')
    const { heroIdentity } = await import('../components/LandingPage/heroIdentity')
    const cv = readPublicCvSections('website', ['personalInformation'], ['en', 'zh'])
    const stored = readCvData()
    const storedHasPersonalInfo = [...stored.en, ...stored.zh].some((s) => s?.sessionName === 'personalInformation')
    const info = (list: typeof cv.en) => list.find((s) => s.sessionName === 'personalInformation')
    const id = heroIdentity(info(cv.en), info(cv.zh), { storedHasPersonalInfo })
    out.name = { en: id.name, zh: id.nameZh || id.name }
    if (!out.email) {
      const cvEmail = field(info(cv.en), 'email') || field(info(cv.zh), 'email')
      if (isPlainEmail(cvEmail)) out.email = cvEmail
    }
  } catch {
    /* no CV */
  }
  return out
}

export async function mailIdentity(): Promise<MailIdentity> {
  const { from, source } = replyFrom()
  const owner = await publicOwner()
  const smtp = smtpConfigured()
  return {
    smtp,
    smtpHost: env('SMTP_HOST') || null,
    from: smtp ? from : null,
    fromSource: smtp ? source : null,
    replyTo: owner.email,
    ownerName: owner.name,
  }
}
