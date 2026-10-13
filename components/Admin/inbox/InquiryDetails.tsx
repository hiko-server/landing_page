import { Badge, Box, Link, Text } from '@chakra-ui/react'
import { INTENT_LABEL, inquiryRows, type InquiryIntent, type InquiryMeta } from '../../../lib/inquiry'
import { MONO } from '../shell/ui'

const INTENT_SCHEME: Record<InquiryIntent, string> = {
  role: 'purple',
  freelance: 'teal',
  collab: 'blue',
  other: 'gray',
}

/** Compact kind badge for an Inbox list row (nothing for older / 'other' messages). */
export function IntentBadge({ meta }: { meta?: InquiryMeta }) {
  const intent = meta?.intent
  if (!intent || intent === 'other') return null
  return (
    <Badge variant="subtle" colorScheme={INTENT_SCHEME[intent]} fontSize="9px" flexShrink={0} textTransform="none">
      {INTENT_LABEL[intent]}
    </Badge>
  )
}

/** Host + path of a link for display ("jobs.example.com/123"). */
function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const rest = `${u.pathname}${u.search}`.replace(/\/$/, '')
    return `${u.host}${rest.length > 48 ? `${rest.slice(0, 47)}…` : rest}`
  } catch {
    return url
  }
}

/**
 * The structured part of a contact message (reason, kind, company, link,
 * timeline) as a definition list above the message body. The visitor's link
 * opens in a new tab without a referrer and is marked nofollow — it is
 * visitor input, never fetched by the server.
 */
export default function InquiryDetails({ meta }: { meta?: InquiryMeta }) {
  const rows = inquiryRows(meta).filter((r) => r.key !== 'intent')
  if (!rows.length && !meta?.intent) return null
  return (
    <Box
      as="section"
      aria-label="Inquiry details"
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      bg="page.bg-elevated"
      px={4}
      py={3}
    >
      {meta?.intent ? (
        <Text fontFamily={MONO} fontSize="10px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary" mb={rows.length ? 2 : 0}>
          {INTENT_LABEL[meta.intent]}
        </Text>
      ) : null}
      {rows.length ? (
        <Box as="dl" display="grid" gridTemplateColumns="max-content minmax(0, 1fr)" columnGap={4} rowGap={1.5} fontSize="sm" m={0}>
          {rows.map((r) => (
            <Box key={r.key} display="contents">
              <Text as="dt" color="page.fg-secondary" fontSize="13px">
                {r.label}
              </Text>
              <Text as="dd" m={0} minW={0} wordBreak="break-word" color="page.fg">
                {r.key === 'roleUrl' ? (
                  <Link
                    href={r.value}
                    isExternal
                    rel="noopener noreferrer nofollow"
                    referrerPolicy="no-referrer"
                    color="accent.text"
                    textDecoration="underline"
                    textUnderlineOffset="3px"
                  >
                    {shortUrl(r.value)}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </Link>
                ) : (
                  r.value
                )}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
