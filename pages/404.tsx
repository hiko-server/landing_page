import React from 'react'
import NextLink from 'next/link'
import { Box, Heading, Text, Link } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'

/**
 * 404 — must stay a real 404 for crawlers. The previous version auto-redirected
 * to "/" after 3s via JS, which Google reads as a soft-404 (it dilutes the
 * homepage and lets dead URLs linger in the index). We now render a static,
 * noindex 404 with a manual link home instead.
 */
const Custom404 = () => {
  return (
    <>
      <CustomHead
        title="404 — Page Not Found"
        description="The page you’re looking for doesn’t exist or has moved."
        noindex
      />
      <HeaderFooter isMobile={false}>
        <Box
          maxW="var(--container-content)"
          mx="auto"
          px={[4, 6, 8]}
          py={[20, 28]}
          textAlign="center"
        >
          <Text
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="12px"
            letterSpacing="0.08em"
            color="gray.500"
            mb={3}
          >
            404
          </Text>
          <Heading
            as="h1"
            fontSize={['28px', '40px']}
            fontWeight={500}
            letterSpacing="-0.02em"
            mb={4}
          >
            This page doesn’t exist.
          </Heading>
          <Text color="gray.500" mb={8}>
            The link may be broken, or the page may have moved.
          </Text>
          <Link as={NextLink} href="/" color="var(--accent)" fontWeight={600}>
            ← Back to home
          </Link>
        </Box>
      </HeaderFooter>
    </>
  )
}

export default Custom404
