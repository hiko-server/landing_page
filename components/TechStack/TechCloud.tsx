import React, { useEffect, useState } from 'react'
import { Skeleton, Tag, Wrap, WrapItem } from '@chakra-ui/react'
import SectionStatusCard from '../General-UI/SectionStatusCard'
import { RemoteDataStatus } from '../../lib/github'

export default function TechCloud() {
  const [packages, setPackages] = useState<string[] | null>(null)
  const [status, setStatus] = useState<RemoteDataStatus>('ok')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('ok')
    setPackages(null)

    fetch('/api/stack')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Request failed')
        }
        const data = await response.json()
        if (alive) {
          setStatus((data.status as RemoteDataStatus) || 'ok')
          setPackages(Array.isArray(data.packages) ? data.packages : [])
        }
      })
      .catch(() => {
        if (alive) {
          setStatus('error')
          setPackages([])
        }
      })

    return () => {
      alive = false
    }
  }, [reloadKey])

  if (!packages) {
    return (
      <Wrap spacing={2} justify="center">
        {Array.from({ length: 10 }).map((_, index) => (
          <WrapItem key={index}>
            <Skeleton height="32px" width="92px" borderRadius="full" />
          </WrapItem>
        ))}
      </Wrap>
    )
  }

  if (status === 'error') {
    return (
      <SectionStatusCard
        title="Tech stack is unavailable"
        description="The package-based stack snapshot could not be loaded right now."
        actionLabel="Retry"
        onAction={() => setReloadKey((value) => value + 1)}
      />
    )
  }

  if (status === 'unconfigured') {
    return (
      <SectionStatusCard
        title="Tech stack is not configured"
        description="This section needs package metadata before it can show the project stack."
      />
    )
  }

  if (!packages.length) {
    return (
      <SectionStatusCard
        title="No stack data available"
        description="This section will list key packages and framework choices when project metadata is available."
      />
    )
  }

  return (
    <Wrap spacing={2} justify="center">
      {packages.map((name) => (
        <WrapItem key={name}>
          <Tag size="lg" variant="subtle" colorScheme="blue">
            {name}
          </Tag>
        </WrapItem>
      ))}
    </Wrap>
  )
}
