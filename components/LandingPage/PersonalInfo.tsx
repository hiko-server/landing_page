'use client'
import React from 'react'
import type { HomeData } from '../../lib/home'
import {
  Box,
  Button,
  Flex,
  Link,
  Text,
  /* Avatar, */ IconButton,
  Stack,
  Image,
} from '@chakra-ui/react'
import HeroHeadline from './HeroHeadline'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
// import LinkedInBadge from "../linkedIn/linkedIn";
import VideoBackgroundLayOut from '../../layout/VideoBackgroundLayout'
import { useRouter } from 'next/router'

const PersonalInfo = ({
  home,
}: {
  home?: HomeData
}) => {
  const [showPhone, setShowPhone] = React.useState(false)
  const [showEmail, setShowEmail] = React.useState(false)

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
  }
  const router = useRouter()
  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  // Overlaying video: force white text for clear contrast
  const textColor = 'white'

  // Avatar transform defaults (industry standard: center, no extra scale)
  const avX =
    (home?.hero as { avatarTransform?: { x?: number } } | undefined)
      ?.avatarTransform?.x ?? 50 // percentage [0..100]
  const avY = ((home as any)?.hero?.avatarTransform?.y ?? 50) as number // percentage [0..100]
  const avScale = ((home as any)?.hero?.avatarTransform?.scale ?? 1) as number // [0.5..3]

  // Use the same avatar source for all modes
  const avatarSrc =
    (home?.hero?.avatarUrl && home.hero.avatarUrl.trim()) ||
    '/images/hikoAvator.png'

  // Clamp values to safe ranges for mobile rendering
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v))
  const posX = clamp(Number(avX) || 50, 0, 100)
  const posY = clamp(Number(avY) || 50, 0, 100)
  const scale = clamp(Number(avScale) || 1, 0.5, 3)

  return (
    <Box position="relative" w="full" h="full">
      <VideoBackgroundLayOut>
        <Box overflow="hidden" pb={['14', '20', '25']} pt={['20', '28', '46']} w="full">
          <Box mx="auto" maxW="1390px" px={['4', '8', '0']}>
            <Flex
              direction={{ base: 'column', lg: 'row' }}
              alignItems={{ lg: 'center' }}
              justifyContent="space-between"
              gap={{ base: '8', lg: '8', xl: '32.5' }}
            >
              <Box
                width={{ base: '100%', md: '100%', lg: '50%' }}
                textAlign={{ base: 'center', lg: 'left' }}
              >
                <Box
                  maxW={{ base: 'xl', lg: '2xl' }}
                  mx={{ base: 'auto', lg: '0' }}
                >
                  <HeroHeadline
                    brand={home?.hero?.brand}
                    tagline={home?.hero?.tagline}
                  />

                  <Text
                    mt={{ base: 4, lg: 6 }}
                    color={textColor}
                    fontSize={{ base: 'md', md: 'lg' }}
                  >
                    Self-taught full-stack engineer building practical products across web, AI, and developer tooling.
                  </Text>

                  <Box mt={{ base: '6', lg: '10' }}>
                    <form onSubmit={handleSubmit}>
                      <Flex
                        flexWrap="wrap"
                        gap="5"
                        justifyContent={{ base: 'center', lg: 'flex-start' }}
                      >
                        <Link
                          href="/contact"
                          aria-label="Contact Us"
                          rounded="full"
                          bg="black"
                          px="7.5"
                          py="2.5"
                          color="white"
                          transition="background-color 300ms ease-in-out"
                          _hover={{ bg: 'blackho' }}
                          _dark={{ bg: 'btndark', _hover: { bg: 'blackho' } }}
                        >
                          Contact Me
                        </Link>
                        <Link
                          href="/cv"
                          aria-label="View CV"
                          rounded="full"
                          borderWidth="1px"
                          borderColor="whiteAlpha.700"
                          px="7.5"
                          py="2.5"
                          color="white"
                          transition="background-color 300ms ease-in-out, border-color 300ms ease-in-out"
                          _hover={{ bg: 'whiteAlpha.200', borderColor: 'white' }}
                        >
                          View CV
                        </Link>
                      </Flex>
                    </form>
                  </Box>
                </Box>
              </Box>

              <Box w={{ base: 'full', lg: '1/2' }}>
                <Flex
                  padding={['12px', '20px', '40px']}
                  direction="column"
                  justifyContent="center"
                  alignItems="center"
                  gap={['16px', '28px', '40px']}
                >
                  <Flex
                    justifyContent="center"
                    alignItems="center"
                    gap={['16px', '28px', '40px']}
                    direction="column"
                    w="full"
                  >
                    {/* Replace Avatar with precision-cropped circular container */}
                    <Box
                      // avatar frame sized for homepage; responsive sizes
                      w={['170px', '220px']}
                      h={['170px', '220px']}
                      borderRadius="full"
                      overflow="hidden"
                      boxShadow="lg"
                      position="relative"
                    >
                      <Image
                        src={avatarSrc}
                        alt={home?.hero?.brand || 'avatar'}
                        w="100%"
                        h="100%"
                        objectFit="cover"
                        sx={{ objectPosition: `${posX}% ${posY}%` }}
                        transform={`scale(${scale})`}
                        transformOrigin={`${posX}% ${posY}%`}
                        draggable={false}
                        pointerEvents="none"
                        // Improve mobile GPU compositing and avoid flicker
                        style={{
                          willChange: 'transform',
                          backfaceVisibility: 'hidden',
                          display: 'block',
                        }}
                      />
                    </Box>

                    <Flex
                      direction="column"
                      gap={['10px', '16px', '20px']}
                      justifyContent="center"
                      alignItems="center"
                      textAlign="center"
                      padding={{ base: '10px', md: '20px' }}
                      borderRadius={'8px'}
                      maxW="xl"
                    >
                      <Text
                        fontSize={['28px', '40px']}
                        fontWeight="bold"
                        textAlign="center"
                        color={textColor}
                      >
                        Li Yanpei, Hiko
                      </Text>
                      <Text
                        fontSize={['28px', '40px']}
                        fontWeight="bold"
                        textAlign="center"
                        color={textColor}
                      >
                        李彦霈
                      </Text>
                      <Text
                        fontSize={['16px', '18px']}
                        textAlign="center"
                        color={textColor}
                      >
                        {showPhone ? (
                          home?.hero?.phone || ''
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => setShowPhone(true)}
                            aria-label="Reveal phone number"
                          >
                            Click to reveal phone
                          </Button>
                        )}
                      </Text>
                      <Text
                        fontSize={['16px', '18px']}
                        textAlign="center"
                        color={textColor}
                      >
                        {showEmail ? (
                          home?.hero?.email ? (
                            <Link href={`mailto:${home.hero.email}`}>
                              {home.hero.email}
                            </Link>
                          ) : null
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => setShowEmail(true)}
                            aria-label="Reveal email"
                          >
                            Click to reveal email
                          </Button>
                        )}
                      </Text>
                      <Text
                        fontSize={['16px', '18px']}
                        textAlign="center"
                        color={textColor}
                      >
                        Mandarin, Cantonese, English
                      </Text>
                    </Flex>

                    <Flex
                      mt={{ base: 2, md: 8 }}
                      w={['100%', '350px']}
                      direction="row"
                      flexWrap="wrap"
                      alignItems="center"
                      justifyContent="center"
                      gap={'10px'}
                    >
                      <Button
                        size="lg"
                        fontSize={['18px', '24px']}
                        onClick={() => router.push('/cv')}
                        colorScheme="black"
                        variant="outline"
                        bg="black.500"
                        color="white"
                        _hover={{ bg: 'black.600' }}
                      >
                        CV
                      </Button>
                      <Stack direction="row" spacing={4} flexWrap="wrap" justify="center">
                        <IconButton
                          size="lg"
                          fontSize={['20px', '24px']}
                          onClick={() =>
                            openExternal(
                              home?.socials?.github ||
                                'https://github.com/HikoPLi'
                            )
                          }
                          icon={<FaGithub />}
                          aria-label="GitHub"
                          colorScheme="black"
                          variant="outline"
                          bg="black"
                          color="white"
                          _hover={{ bg: 'gray.700' }}
                        />

                        <IconButton
                          size="lg"
                          fontSize={['20px', '24px']}
                          onClick={() =>
                            openExternal(
                              home?.socials?.gitlab ||
                                'https://gitlab.com/HikoPLi'
                            )
                          }
                          icon={<FaGitlab />}
                          aria-label="GitLab"
                          colorScheme="orange"
                          variant="outline"
                          bg="orange.500"
                          color="white"
                          _hover={{ bg: 'orange.600' }}
                        />

                        <IconButton
                          size="lg"
                          fontSize={['20px', '24px']}
                          onClick={() =>
                            openExternal(
                              home?.socials?.linkedin ||
                                'https://www.linkedin.com/in/liyanpeihiko/'
                            )
                          }
                          icon={<FaLinkedin />}
                          aria-label="LinkedIn"
                          colorScheme="linkedin"
                          variant="outline"
                          bg="linkedin.500"
                          color="white"
                          _hover={{ bg: 'linkedin.600' }}
                        />
                        <IconButton
                          size="lg"
                          fontSize={['20px', '24px']}
                          onClick={() =>
                            openExternal(
                              home?.socials?.whatsapp ||
                                'https://wa.me/85262040827'
                            )
                          }
                          icon={<FaWhatsapp />}
                          aria-label="WhatsApp"
                          colorScheme="whatsapp"
                          variant="outline"
                          bg="whatsapp.500"
                          color="white"
                          _hover={{ bg: 'whatsapp.600' }}
                        />
                      </Stack>
                    </Flex>
                  </Flex>
                  {/* <LinkedInBadge /> */}
                </Flex>
              </Box>
            </Flex>
          </Box>
        </Box>
      </VideoBackgroundLayOut>
    </Box>
  )
}

export default PersonalInfo
