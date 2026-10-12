import React, { useMemo } from 'react'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

import { field, list } from '../CVViewerPage/fields'
import { safeHref } from '../../lib/cvFormat'
import type { CvSectionLike } from '../../lib/cvVisibility'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const MotionBox = motion(Box)

type Org = { key: string; name: string; certs: Array<{ key: string; name: string; href: string }> }

/**
 * [07] Certifications — org-grouped chips on a flat surface.
 *
 * Built from the public CV; a hidden certificate, URL or org name is simply
 * absent. Credential links go through safeHref, so only http(s) URLs become
 * links — anything else renders as a plain chip.
 */
export default function CertificationsPeek({ cvEn }: { cvEn?: CvSectionLike[] }) {
  const reduce = useReducedMotion()

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

  return (
    <Box w="100%" maxW="1100px" mx="auto">
      {orgs.map((org, oi) => (
        <MotionBox
          key={org.key}
          as="section"
          aria-label={org.name || undefined}
          mb={6}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: oi * 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          {org.name && (
            <Text as="h3" fontFamily={monoFont} fontSize="11px" letterSpacing="0.14em" textTransform="uppercase" color="page.fg-secondary" mb={3}>
              <Box as="span" aria-hidden mr={1.5}>
                ▸
              </Box>
              {org.name}
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
                      {c.name}
                      <Text as="span" fontFamily={monoFont} fontSize="10px" color="page.fg-secondary" aria-hidden>
                        ↗
                      </Text>
                      <span className="sr-only"> (credential, opens in a new tab)</span>
                    </Link>
                  ) : (
                    <Box as="span" {...chip}>
                      {c.name}
                    </Box>
                  )}
                </li>
              )
            })}
          </Flex>
        </MotionBox>
      ))}
    </Box>
  )
}
