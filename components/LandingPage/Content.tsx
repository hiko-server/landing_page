import {
  Text,
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Link,
  VStack,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'

const Content = () => {
  const router = useRouter()
  return (
    <Flex direction={'column'}>
      <Flex
        direction={'column'}
        flex={1}
        alignItems={'center'}
        justifyContent={'center'}
        h={'100%'}
        overflowY={router.asPath.includes('edit') ? 'scroll' : 'hidden'}
        p={'0px'}
        gap={'20px'}
      >
        <Flex justifyContent={'center'} alignItems={'center'} gap={'20px'}>
          <Text fontSize={'22px'}>
            Passionate Self-Taught Full-Stack Software Engineer | Exploring
            Innovative Solutions in Computer Science | Typescript | React |
            Next.js | NestJS | Python FastAPI
          </Text>
        </Flex>
        <Accordion allowToggle width="100%" maxW="400px">
          <AccordionItem>
            <AccordionButton _expanded={{ bg: 'gray.100' }}>
              <Box flex="1" textAlign="left" fontWeight="bold">
                <Text fontSize="md" fontWeight="bold">
                  My App
                </Text>
              </Box>
              <AccordionIcon />
            </AccordionButton>

            <AccordionPanel pb={4}>
              <VStack spacing={2} align="stretch">
                <Link href="https://cv.hiko.dev" target="_blank">
                  <Text fontSize="md" fontWeight="bold">
                    CV
                  </Text>
                </Link>
                <Link href="https://hiko.dev/cv/edit" target="_blank">
                  <Text fontSize="md" fontWeight="bold">
                    CV Generator Demo
                  </Text>
                </Link>
              </VStack>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Flex>
    </Flex>
  )
}

export default Content
