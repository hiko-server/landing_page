import { useMemo } from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { m, useReducedMotion } from 'framer-motion'

import { field, list } from '../CVViewerPage/fields'
import { useScrollReveal } from '../General-UI/useScrollReveal'
import { safeHref } from '../../lib/cvFormat'
import type { CvSectionLike } from '../../lib/cvVisibility'
import { revealVariant } from '../../lib/reveal'
import { ChevronRightIcon } from '../Icons/ui/content'
import { useHomeUi, useOwnLang } from './homeUi'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

type Org = { key: string; name: string; certs: Array<{ key: string; name: string; href: string }> }

/**
 * Certifications — org-grouped chips on a flat surface.
 *
 * Built from the public CV; a hidden certificate, URL or org name is simply
 * absent. Credential links go through safeHref, so only http(s) URLs become
 * links — anything else renders as a plain chip. Organisations fade in with
 * one stagger for the block when it scrolls up from below the fold (static
 * when already on screen or under reduced motion, lib/reveal.ts); names
 * carry their own `lang`.
 */
export default function CertificationsPeek({ cvEn }: { cvEn?: CvSectionLike[] }) {
  const { t } = useHomeUi()
  const ownLang = useOwnLang()
  const reduce = useReducedMotion()
  const reveal = useScrollReveal<HTMLDivElement>()

  const orgs: Org[] = useMemo(() => {
    const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === 'certification') : undefined
    return list(section, 'certifications')
      .map((org: any, oi: number) => ({
        key: `${oi}-${field(org, 'issuingOrganization')}`,
        name: field(org, 'issuingOrganization'),
        certs: list(org, 'CertificationList')
          .map((c: any, ci: number) => ({ key: `${ci}`, name: field(c, 'certificationName'), href: safeHref(field(c, 'credentialURL')) }))
          .filter((c) => c.name)
          .slice(0, 8),
      }))
      .filter((o) => o.certs.length > 0)
      .slice(0, 4)
  }, [cvEn])

  if (!orgs.length) return null

  const row = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] } } }
  const stagger = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.03 } } }

  return (
    <Box w="100%" maxW="1100px" mx="auto">
      <m.div ref={reveal.ref} data-reveal-list="" initial={false} animate={revealVariant(reveal.phase)} variants={stagger}>
        {orgs.map((org) => (
          <m.section key={org.key} aria-label={org.name || undefined} variants={row} data-reveal-item="" style={{ marginBottom: 24 }}>
            {org.name && (
              <Text as="h3" display="flex" alignItems="center" fontFamily={monoFont} fontSize="11px" letterSpacing="0.14em" textTransform="uppercase" color="page.fg-secondary" mb={3}>
                <Box as="span" display="inline-flex" mr={1.5}>
                  <ChevronRightIcon size="xs" />
                </Box>
                <span lang={ownLang(org.name)}>{org.name}</span>
              </Text>
            )}
            <Flex as="ul" listStyleType="none" wrap="wrap" gap={2}>
              {org.certs.map((c) => {
                const chip = {
                  border: '1px solid',
                  borderColor: 'page.border',
                  borderRadius: 'md',
                  px: 3,
                  py: 1.5,
                  fontSize: '12px',
                  color: 'page.fg',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1.5,
                  transition: 'border-color 200ms var(--ease-out-quart), color 200ms var(--ease-out-quart)',
                } as const
                return (
                  <li key={c.key}>
                    {c.href ? (
                      <Link
                        href={c.href}
                        isExternal
                        rel="noopener noreferrer"
                        {...chip}
                        _hover={{ textDecoration: 'none', borderColor: 'page.border-strong', color: 'accent.text' }}
                        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                      >
                        <span lang={ownLang(c.name)}>{c.name}</span>
                        <Text as="span" fontFamily={monoFont} fontSize="10px" color="page.fg-secondary" aria-hidden>
                          ↗
                        </Text>
                        <span className="sr-only">{t.certificationLink}</span>
                      </Link>
                    ) : (
                      <Box as="span" {...chip} lang={ownLang(c.name)}>
                        {c.name}
                      </Box>
                    )}
                  </li>
                )
              })}
            </Flex>
          </m.section>
        ))}
      </m.div>
    </Box>
  )
}
