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
  useColorMode,
  Tooltip,
} from '@chakra-ui/react'
import { FaSun, FaMoon } from 'react-icons/fa'
import HeroHeadline from './HeroHeadline'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from 'react-icons/fa'
// import LinkedInBadge from "../linkedIn/linkedIn";
import VideoBackgroundLayOut from '../../layout/VideoBackgroundLayout'
import { useRouter } from 'next/router'

const PersonalInfo = ({
  isMobile,
  home,
}: {
  isMobile: boolean
  home?: HomeData
}) => {
  const [showPhone, setShowPhone] = React.useState(false)
  const [showEmail, setShowEmail] = React.useState(false)
  const { colorMode, toggleColorMode } = useColorMode()

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
  }
  const router = useRouter()
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
        <Box overflow="hidden" pb={['20', '25']} pt={['35', '40', '46']}>
          <Box mx="auto" maxW="1390px" px={['4', '8', '0']}>
            <Flex
              alignItems={{ lg: 'center' }}
              gap={{ base: '4', lg: '8', xl: '32.5' }}
            >
              {!isMobile && (
                <Box width={{ base: '100%', md: '50%' }}>
                  <HeroHeadline
                    brand={home?.hero?.brand}
                    tagline={home?.hero?.tagline}
                  />

                  <Box mt="10">
                    <form onSubmit={handleSubmit}>
                      <Flex flexWrap="wrap" gap="5">
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
                      </Flex>
                    </form>
                  </Box>
                </Box>
              )}

              <Box w={{ base: 'full', md: '1/2' }}>
                <Flex
                  padding={['20px', '40px']}
                  direction="column"
                  justifyContent="center"
                  alignItems="center"
                  gap={['20px', '40px']}
                >
                  <Flex
                    justifyContent="center"
                    alignItems="center"
                    gap={['20px', '40px']}
                    direction="column"
                  >
                    {/* Replace Avatar with precision-cropped circular container */}
                    <Box
                      // avatar frame sized for homepage; responsive sizes
                      w={['180px', '220px']}
                      h={['180px', '220px']}
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
                      gap={['10px', '20px']}
                      justifyContent="center"
                      alignItems="center"
                      textAlign="center"
                      padding={'20px'}
                      borderRadius={'8px'}
                    >
                      <Text
                        fontSize={['30px', '40px']}
                        fontWeight="bold"
                        textAlign="center"
                        color={textColor}
                      >
                        Li Yanpei, Hiko
                      </Text>
                      <Text
                        fontSize={['30px', '40px']}
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
                      mt={8}
                      w={['100%', '350px']}
                      direction="row"
                      alignItems="center"
                      justifyContent="center"
                      gap={'10px'}
                    >
                      <Button
                        size="lg"
                        fontSize={['20px', '24px']}
                        mb={6}
                        onClick={() => router.push('/cv')}
                        colorScheme="black"
                        variant="outline"
                        bg="black.500"
                        color="white"
                        _hover={{ bg: 'black.600' }}
                      >
                        CV
                      </Button>
                      <Tooltip label={colorMode === 'light' ? 'Dark mode' : 'Light mode'} placement="top">
                        <IconButton
                          size="lg"
                          mb={6}
                          onClick={toggleColorMode}
                          icon={colorMode === 'light' ? <FaMoon /> : <FaSun />}
                          aria-label="Toggle color mode"
                          variant="outline"
                          bg="rgba(0,0,0,0.4)"
                          color="white"
                          borderColor="rgba(255,255,255,0.3)"
                          _hover={{ bg: 'rgba(0,0,0,0.6)' }}
                        />
                      </Tooltip>
                      <Stack direction="row" spacing={4}>
                        <IconButton
                          size="lg"
                          fontSize={['20px', '24px']}
                          mb={6}
                          onClick={() =>
                            window.open(
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
                            window.open(
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
                          mb={6}
                          onClick={() =>
                            window.open(
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
                          mb={6}
                          onClick={() =>
                            window.open(
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
