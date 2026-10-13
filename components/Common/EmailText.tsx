import React from 'react'

/**
 * An e-mail address or phone number as text that survives Cloudflare's
 * e-mail obfuscation without breaking hydration.
 *
 * Cloudflare rewrites addresses it finds in the HTML into
 * `<a class="__cf_email__">[email protected]</a>`, so the markup React
 * hydrates no longer matches what it rendered (React errors #418 / #425,
 * and the whole page re-renders on the client). Two things prevent that:
 *
 *   - `<!--email_off-->…<!--/email_off-->` tells Cloudflare to leave the
 *     value alone;
 *   - the value is set through dangerouslySetInnerHTML, whose children
 *     React never compares while hydrating.
 *
 * mailto:/tel: hrefs stay ordinary attributes (attribute differences are
 * not hydration errors).
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** HTML-escape text for use inside element content. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

/** The inner HTML EmailText renders: the escaped value between Cloudflare's email_off markers. */
export function emailOffHtml(value: string): string {
  return `<!--email_off-->${escapeHtml(value)}<!--/email_off-->`
}

export default function EmailText({ value, className }: { value: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: emailOffHtml(value) }} />
}
