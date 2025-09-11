import React, { useEffect, useState } from 'react'
import { Wrap, WrapItem, Tag } from '@chakra-ui/react'

export default function TechCloud() {
  const [packages, setPackages] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/stack')
      .then(r => r.json())
      .then(d => { if (alive) setPackages(d.packages || []) })
      .catch(() => { if (alive) setPackages([]) })
    return () => { alive = false }
  }, [])

  if (!packages || !packages.length) return null

  return (
    <Wrap spacing={2} justify="center">
      {packages.map((name) => (
        <WrapItem key={name}>
          <Tag size="lg" variant="subtle" colorScheme="blue">{name}</Tag>
        </WrapItem>
      ))}
    </Wrap>
  )
}

