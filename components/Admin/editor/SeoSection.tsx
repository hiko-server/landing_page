import { useEffect, useId, useState } from 'react'
import { Box, Button, Flex, Skeleton, Stack, Text } from '@chakra-ui/react'
import dynamic from 'next/dynamic'
import { MONO } from '../shell/ui'
import { cssTransition } from '../../../theme/tokens'
import { Collapse } from '../../General-UI/Collapse'
import type { SeoPanelProps } from './SeoPanel'

// The fields, the measuring canvas and the previews load when the section opens.
const SeoPanel = dynamic(() => import('./SeoPanel'), {
  ssr: false,
  loading: () => (
    <Stack spacing={3} aria-busy="true" aria-label="Loading search and sharing">
      <Skeleton h="40px" />
      <Skeleton h="120px" />
    </Stack>
  ),
})

const OPEN_KEY = 'admin:seo-open'

/**
 * "Search & sharing" disclosure in the post and case-study editors (H1).
 * Closed by default (remembered per device); its panel — and the card
 * previews it requests — only load while it is open.
 */
export default function SeoSection(props: SeoPanelProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(OPEN_KEY) === '1')
    } catch {
      /* storage blocked: start closed */
    }
  }, [])
  const toggle = () =>
    setOpen((o) => {
      try {
        window.localStorage.setItem(OPEN_KEY, o ? '0' : '1')
      } catch {
        /* not remembered */
      }
      return !o
    })
  const custom = [props.seoTitle.trim() ? 'search title' : '', props.lang ? 'language' : '', props.updated ? 'updated date' : ''].filter(Boolean)

  return (
    <Box as="section" aria-labelledby={`${id}-heading`} border="1px solid" borderColor="page.border" borderRadius="lg" id="item-seo">
      <Flex
        as="h3"
        id={`${id}-heading`}
        m={0}
        fontSize="inherit"
        fontWeight="inherit"
      >
        <Button
          variant="ghost"
          w="100%"
          justifyContent="space-between"
          h="auto"
          minH="48px"
          px={{ base: 4, md: 5 }}
          py={3}
          borderRadius="lg"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={toggle}
          fontWeight={400}
          textAlign="left"
          whiteSpace="normal"
        >
          <Box minW={0}>
            <Text as="span" display="block" fontSize="14px" fontWeight={600} color="page.fg">
              Search &amp; sharing
            </Text>
            <Text as="span" display="block" fontSize="12px" color="page.fg-secondary" mt={0.5}>
              {custom.length ? `Custom ${custom.join(', ')} · ` : ''}Google, LinkedIn, X, WhatsApp, Slack and WeChat previews
            </Text>
          </Box>
          <Box as="span" fontFamily={MONO} fontSize="14px" color="page.fg-secondary" transition={cssTransition('transform', 'base')} transform={open ? 'rotate(90deg)' : 'none'} aria-hidden ml={3}>
            ›
          </Box>
        </Button>
      </Flex>
      <Collapse open={open} id={`${id}-panel`}>
        <Box px={{ base: 4, md: 5 }} pb={5} pt={1}>
          {open ? <SeoPanel {...props} /> : null}
        </Box>
      </Collapse>
    </Box>
  )
}
