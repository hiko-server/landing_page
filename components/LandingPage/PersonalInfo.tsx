import {
  Text,
  Flex,
  Avatar,
  Button,
  IconButton,
  Stack,
  Link,
} from '@chakra-ui/react'
import React from 'react'
import LinkedInBadge from '../linkedIn/linkedIn'
import { FaGithub, FaGitlab, FaLinkedin, FaWhatsapp } from "react-icons/fa";
const PersonalInfo = ({ isMobile }: { isMobile: boolean }) => {
  return (
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
          src="https://github.com/WeGreen-AI/Intro/blob/main/Members/hikoAvator.png?raw=true"
          transition="transform 0.3s ease"
          _hover={{ transform: 'scale(1.05)' }}
        />

        <Flex
          direction="column"
          gap={['10px', '20px']}
          justifyContent="center"
          alignItems="center"
          textAlign="center"
          backgroundColor={'#ffffff'}
          padding={'20px'}
          borderRadius={'8px'}
          boxShadow={'0 4px 8px rgba(0, 0, 0, 0.1)'}
        >
          <Text
            fontSize={['30px', '40px']}
            fontWeight="bold"
            textAlign="center"
            color={'#333'}
          >
            Li Yanpei, Hiko
          </Text>
          <Text
            fontSize={['30px', '40px']}
            fontWeight="bold"
            textAlign="center"
            color={'#333'}
          >
            李彦霈
          </Text>
          <Text fontSize={['16px', '18px']} textAlign="center" color={'#333'}>
            +852 62040827
          </Text>
          <Link href="mailto:hi@hiko.dev" fontSize={['16px', '18px']} textAlign="center" color={'#333'}>
            hi@hiko.dev
          </Link>
          <Text fontSize={['16px', '18px']} textAlign="center" color={'#333'}>
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
          {isMobile ? (
            <></>
          ) : (
            <Button
              size="lg"
              fontSize={['20px', '24px']}
              mb={6}
              onClick={() => window.open('https://hiko.dev/cv')}
              colorScheme="black"
              variant="outline"
              
            >
              CV
            </Button>
          )}

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
            />

            <IconButton
              size="lg"
              fontSize={['20px', '24px']}
              onClick={() => window.open('https://gitlab.com/HikoPLi')}
              icon={<FaGitlab />}
              aria-label="GitLab"
              colorScheme="orange"
              variant="outline"
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
            />
          </Stack>
        </Flex>
      </Flex>
              <LinkedInBadge />
      </Flex>
  )
}

export default PersonalInfo
