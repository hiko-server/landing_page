import React from 'react'
import { Box, Button, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { useRouter } from 'next/router'

export default function AdminIndex() {
  const [isMobile] = [false]
  const router = useRouter()

  const items = [
    { title: 'Dashboard (All Editors)', desc: 'Open combined Home & CV editors', href: '/admin/dashboard' },
    { title: 'Edit Home', desc: 'Hero, socials, brands, quick access, images', href: '/admin/dashboard?tab=home' },
    { title: 'Edit CV', desc: 'English/Chinese data, sync structure', href: '/admin/dashboard?tab=cv' },
  ]

  return (
    <>
      <CustomHead title="Admin" description="Admin portal" />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" gap={6} p={6}>
          <Heading size="md">Admin Portal</Heading>
          <SimpleGrid columns={[1, 2, 3]} gap={4}>
            {items.map((it) => (
              <Box key={it.href} p={5} borderWidth="1px" borderRadius="md">
                <Heading size="sm" mb={2}>{it.title}</Heading>
                <Text color="gray.600" mb={3}>{it.desc}</Text>
                <Button onClick={() => router.push(it.href)} colorScheme="teal">Open</Button>
              </Box>
            ))}
          </SimpleGrid>
        </Flex>
      </HeaderFooter>
    </>
  )
}

