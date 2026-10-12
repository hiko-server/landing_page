type MailOptions = { to: string; subject: string; text?: string; html?: string; replyTo?: string }

/**
 * Send mail via SMTP when configured; otherwise skip quietly.
 *
 * Never logs message bodies — they can carry password-reset links and
 * contact-form personal data. Timeouts keep a dead SMTP server from holding
 * an API request open.
 */
export async function sendMail(opts: MailOptions): Promise<{ ok: boolean; skipped?: boolean }> {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.FROM_EMAIL || user

  if (!host || !user || !pass || !from) {
    console.log(`[mail] SMTP not configured; skipped "${opts.subject}" → ${opts.to}`)
    return { ok: false, skipped: true }
  }
  // dynamic import nodemailer only when configured
  const nodemailer = (await import('nodemailer')).default
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  })
  return { ok: true }
}

export function siteUrl() {
  return process.env.SITE_URL || 'https://lucian-dev.com'
}
