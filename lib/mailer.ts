type MailOptions = { to: string; subject: string; text?: string; html?: string }

export async function sendMail(opts: MailOptions) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.FROM_EMAIL || user

  if (!host || !user || !pass || !from) {
    console.log('[mail] SMTP not configured; skip send', opts)
    return { ok: false, skipped: true }
  }
  // dynamic import nodemailer only when configured
  const nodemailer = (await import('nodemailer')).default
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html })
  return { ok: true }
}

export function siteUrl() {
  return process.env.SITE_URL || 'https://lucian-dev.com'
}

