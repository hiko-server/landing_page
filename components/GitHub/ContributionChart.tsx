import React, { useMemo, useState } from 'react'
import { Box, Image, Skeleton, Text, useColorModeValue } from '@chakra-ui/react'
import SectionStatusCard from '../General-UI/SectionStatusCard'

export default function ContributionChart({ githubUser }: { githubUser: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const mutedText = useColorModeValue('gray.500', 'gray.400')
  const chartUrl = useMemo(() => `https://ghchart.rshah.org/${githubUser}`, [githubUser])

  if (!githubUser) {
    return (
      <SectionStatusCard
        title="Contribution chart unavailable"
        description="Add a GitHub username to show the contribution heatmap here."
      />
    )
  }

  return (
    <Box w="100%">
      {status === 'loading' ? <Skeleton height="160px" borderRadius="2xl" /> : null}
      {status === 'error' ? (
        <SectionStatusCard
          title="Contribution chart could not be loaded"
          description="The external contribution heatmap is temporarily unavailable. GitHub activity is still shown above."
        />
      ) : null}
      <Box display={status === 'error' ? 'none' : 'block'}>
        <Image
          src={chartUrl}
          alt="GitHub contributions"
          w="100%"
          borderRadius="2xl"
          borderWidth="1px"
          borderColor={borderColor}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          display={status === 'ready' ? 'block' : 'none'}
        />
      </Box>
      {status === 'ready' ? (
        <Text mt={2} fontSize="xs" color={mutedText}>
          Contribution chart provided by a public third-party image service.
        </Text>
      ) : null}
    </Box>
  )
}
