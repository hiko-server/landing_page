"use client";
import { Box, Button, Flex, Heading, Link, Text, Avatar, IconButton, Stack } from "@chakra-ui/react";
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from "react-icons/fa";
// import LinkedInBadge from "../linkedIn/linkedIn";
import VideoBackgroundLayOut from "../../layout/VideoBackgroundLayout";

const PersonalInfo = ({ isMobile }: { isMobile: boolean }) => {

  const handleSubmit = (e: { preventDefault: () => void; }) => {
    e.preventDefault();
  };

  return (
    <Box position="relative" w="full" h="full" >
      <VideoBackgroundLayOut >
      <Box overflow="hidden" pb={["20", "25"]} pt={["35", "40", "46"]} >
        <Box mx="auto" maxW="1390px" px={["4", "8", "0"]}>
          <Flex alignItems={{  lg: "center" }} gap={{ base: "4", lg: "8", xl: "32.5" }} >
          {!isMobile && (
            <Box width={{ base: "100%", md: "50%" }}>
              <Heading as="h4" mb="4.5" fontSize="lg" fontWeight="medium" color={isMobile ? "black" : "white"}>
              Welcome to 
              </Heading>
              <Heading as="h1" mb="5" pr="16" fontSize="3xl" fontWeight="bold" color={isMobile ? "black" : "white"}>
                
                <Box as="span" position="relative" display="inline-block" _before={{
                  content: '""',
                  position: "absolute",
                  bottom: "2.5",
                  left: "0",
                  zIndex: "-1",
                  height: "3",
                  width: "full",
                  bg: "titlebg",
                  _dark: { bg: "titlebgdark" }
                }}>
                  HIKO.DEV
                </Box>
              </Heading>
              <Text color={isMobile ? "black" : "white"}>
                Self-Taught Full-Stack Software Engineer | Exploring Innovative Solutions in Computer Science | Machine Learning | Computer Vision | Typescript | React | Next.js | NestJS | Python FastAPI
              </Text>

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
                      _hover={{ bg: "blackho" }}
                      _dark={{ bg: "btndark", _hover: { bg: "blackho" } }}
                    >
                      Contact Me
                    </Link>
                  </Flex>
                </form>
              </Box>
            </Box>
          )}
            
            <Box  w={{ base: "full", md: "1/2" }}>
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
                  <Avatar
                    size="2xl"
                    name="Hiko"
                    src="/images/hikoAvator.png"
                    transition="transform 0.3s ease"
                    _hover={{ transform: 'scale(1.05)' }}
                  />

                  <Flex
                    direction="column"
                    gap={['10px', '20px']}
                    justifyContent="center"
                    alignItems="center"
                    textAlign="center"
                    // backgroundColor={'#ffffff'}
                    padding={'20px'}
                    borderRadius={'8px'}
                      // boxShadow={'0 4px 8px rgba(0, 0, 0, 0.1)'}

                    >

                    <Text
                      fontSize={['30px', '40px']}
                      fontWeight="bold"
                      textAlign="center"
                      color={isMobile ? "black" : "white"}
                    >
                      Li Yanpei, Hiko
                    </Text>
                    <Text
                      fontSize={['30px', '40px']}
                      fontWeight="bold"
                      textAlign="center"
                      color={isMobile ? "black" : "white"}
                    >
                      李彦霈
                    </Text>
                    <Text fontSize={['16px', '18px']} textAlign="center"color={isMobile ? "black" : "white"}>
                      +852 62040827
                    </Text>
                    <Link href="mailto:hi@hiko.dev" fontSize={['16px', '18px']} textAlign="center" color={isMobile ? "black" : "white"}>
                      hi@hiko.dev
                    </Link>
                    <Text fontSize={['16px', '18px']} textAlign="center" color={isMobile ? "black" : "white"}>
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
                        onClick={() => window.open('https://hiko.dev/cv')}
                        colorScheme="black"
                        variant="outline"
                        bg="black.500"
                        color="white"
                        _hover={{ bg: "black.600" }}
                      >
                        CV
                      </Button>
                    <Stack direction="row" spacing={4}>
                      <IconButton
                        size="lg"
                        fontSize={['20px', '24px']}
                        mb={6}
                        onClick={() => window.open('https://github.com/HikoPLi')}
                        icon={<FaGithub />}
                        aria-label="GitHub"
                        colorScheme="black"
                        variant="outline"
                        bg="black"
                        color="white"
                        _hover={{ bg: "gray.700" }}
                      />

                      <IconButton
                        size="lg"
                        fontSize={['20px', '24px']}
                        onClick={() => window.open('https://gitlab.com/HikoPLi')}
                        icon={<FaGitlab />}
                        aria-label="GitLab"
                        colorScheme="orange"
                        variant="outline"
                        bg="orange.500"
                        color="white"
                        _hover={{ bg: "orange.600" }}
                      />

                      <IconButton
                        size="lg"
                        fontSize={['20px', '24px']}
                        mb={6}
                        onClick={() => window.open('https://www.linkedin.com/in/liyanpeihiko/')}
                        icon={<FaLinkedin />}
                        aria-label="LinkedIn"
                        colorScheme="linkedin"
                        variant="outline"
                        bg="linkedin.500"
                        color="white"
                        _hover={{ bg: "linkedin.600" }}
                      />
                      <IconButton
                        size="lg"
                        fontSize={['20px', '24px']}
                        mb={6}
                        onClick={() => window.open('https://wa.me/85262040827')}
                        icon={<FaWhatsapp />}
                        aria-label="WhatsApp"
                        colorScheme="whatsapp"
                        variant="outline"
                        bg="whatsapp.500"
                        color="white"
                        _hover={{ bg: "whatsapp.600" }}
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
  );
};

export default PersonalInfo;
