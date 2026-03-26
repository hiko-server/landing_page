import React from 'react'
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import SectionReveal from './SectionReveal'

type Props = {
  code: '404' | '500'
  title: string
  description: string
  guidance: string
}

const ErrorPageState = ({ code, title, description, guidance }: Props) => {
  const router = useRouter()
  const panelBg = useColorModeValue('rgba(255, 255, 255, 0.92)', 'rgba(17, 24, 39, 0.88)')
  const panelBorder = useColorModeValue('rgba(15, 23, 42, 0.08)', 'rgba(148, 163, 184, 0.24)')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  const statBg = useColorModeValue('whiteAlpha.900', 'whiteAlpha.120')

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/')
  }

  return (
    <Flex align="center" justify="center" px={{ base: 4, md: 8 }} py={{ base: 10, md: 16 }}>
      <SectionReveal width="100%" maxW="5xl">
        <Box
          borderWidth="1px"
          borderColor={panelBorder}
          bg={panelBg}
          backdropFilter="blur(18px)"
          boxShadow="0 28px 80px rgba(15, 23, 42, 0.16)"
          borderRadius="3xl"
          overflow="hidden"
        >
          <SimpleGrid columns={{ base: 1, lg: 2 }}>
            <Flex
              direction="column"
              justify="space-between"
              px={{ base: 6, md: 10 }}
              py={{ base: 8, md: 12 }}
              gap={6}
              bg="linear-gradient(160deg, rgba(37, 99, 235, 0.18), rgba(6, 182, 212, 0.08))"
            >
              <Box>
                <Badge colorScheme={code === '404' ? 'orange' : 'red'} px={3} py={1} borderRadius="full" fontSize="xs">
                  Error {code}
                </Badge>
                <Heading mt={5} size="2xl" lineHeight="1.05">
                  {title}
                </Heading>
                <Text mt={4} fontSize={{ base: 'md', md: 'lg' }} color={mutedText}>
                  {description}
                </Text>
              </Box>

              <Box>
                <Text fontWeight="semibold">What you can do now</Text>
                <Text mt={2} color={mutedText}>
                  {guidance}
                </Text>
              </Box>
            </Flex>

            <Flex direction="column" justify="space-between" px={{ base: 6, md: 10 }} py={{ base: 8, md: 12 }} gap={8}>
              <Box>
                <Heading size="md">Quick recovery</Heading>
                <Text mt={3} color={mutedText}>
                  Use one of the shortcuts below to get back to a working part of the site.
                </Text>

                <Flex mt={6} gap={3} wrap="wrap">
                  <Button colorScheme="teal" onClick={() => router.push('/')}>
                    Back to Home
                  </Button>
                  <Button variant="outline" onClick={handleBack}>
                    Go Back
                  </Button>
                  <Button variant="ghost" onClick={() => router.push('/contact')}>
                    Contact Hiko
                  </Button>
                </Flex>
              </Box>

              <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                <Box p={4} borderRadius="2xl" bg={statBg}>
                  <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color={mutedText}>
                    Suggested next page
                  </Text>
                  <Text mt={2} fontWeight="semibold">
                    {code === '404' ? 'Homepage or CV' : 'Homepage or Contact'}
                  </Text>
                </Box>
                <Box p={4} borderRadius="2xl" bg={statBg}>
                  <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color={mutedText}>
                    Status
                  </Text>
                  <Text mt={2} fontWeight="semibold">
                    {code === '404' ? 'The link is missing or outdated' : 'Something failed while loading the page'}
                  </Text>
                </Box>
              </SimpleGrid>
            </Flex>
          </SimpleGrid>
        </Box>
      </SectionReveal>
    </Flex>
  )
}

export default ErrorPageState
