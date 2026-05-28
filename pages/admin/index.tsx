import React from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Text,
  useColorModeValue,
  Badge,
  Icon,
} from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { useRouter } from 'next/router'
import { FaHome, FaFileAlt, FaDatabase, FaHistory, FaLayerGroup, FaPenNib, FaBriefcase, FaClock, FaToolbox } from 'react-icons/fa'

const cards = [
  {
    title: 'All Editors',
    desc: 'Dashboard with Home & CV editors in one place',
    href: '/admin/dashboard',
    icon: FaLayerGroup,
    gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)',
    badge: 'Main',
    badgeColor: 'teal',
  },
  {
    title: 'Home Editor',
    desc: 'Hero section, socials, brands, photos, background',
    href: '/admin/dashboard?tab=home',
    icon: FaHome,
    gradient: 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
    badge: 'Home',
    badgeColor: 'blue',
  },
  {
    title: 'CV Editor',
    desc: 'English / Chinese CV data, JSON & visual GUI',
    href: '/admin/dashboard?tab=cv',
    icon: FaFileAlt,
    gradient: 'linear-gradient(135deg,#9333ea,#c084fc)',
    badge: 'CV',
    badgeColor: 'purple',
  },
  {
    title: 'Version History',
    desc: 'Browse and restore file-based snapshots for CV & Home',
    href: '/admin/dashboard?tab=versions',
    icon: FaHistory,
    gradient: 'linear-gradient(135deg,#dd6b20,#f59e0b)',
    badge: 'History',
    badgeColor: 'orange',
  },
  {
    title: 'DB & Backup',
    desc: 'Configure MongoDB, run full backups and restores',
    href: '/admin/db-config',
    icon: FaDatabase,
    gradient: 'linear-gradient(135deg,#0f172a,#334155)',
    badge: 'DB',
    badgeColor: 'gray',
  },
  {
    title: 'Blog Posts',
    desc: 'Write and manage MDX blog posts at /blog',
    href: '/admin/blog',
    icon: FaPenNib,
    gradient: 'linear-gradient(135deg,#6366f1,#a5b4fc)',
    badge: 'Blog',
    badgeColor: 'purple',
  },
  {
    title: 'Case Studies',
    desc: 'Write and manage project case studies at /work',
    href: '/admin/work',
    icon: FaBriefcase,
    gradient: 'linear-gradient(135deg,#0ea5e9,#67e8f9)',
    badge: 'Work',
    badgeColor: 'cyan',
  },
  {
    title: 'Now Page',
    desc: 'Edit /now — current focus, projects, location',
    href: '/admin/now',
    icon: FaClock,
    gradient: 'linear-gradient(135deg,#16a34a,#86efac)',
    badge: 'Now',
    badgeColor: 'green',
  },
  {
    title: 'Uses Page',
    desc: 'Edit /uses — hardware, editor, stack',
    href: '/admin/uses',
    icon: FaToolbox,
    gradient: 'linear-gradient(135deg,#db2777,#f9a8d4)',
    badge: 'Uses',
    badgeColor: 'pink',
  },
]

export default function AdminIndex() {
  const router = useRouter()
  const cardBg = useColorModeValue('rgba(255,255,255,0.85)', 'rgba(30,41,59,0.7)')
  const border = useColorModeValue('rgba(0,0,0,0.06)', 'rgba(255,255,255,0.09)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const pageBg = useColorModeValue('gray.50', 'gray.900')

  return (
    <>
      <CustomHead title="Admin Portal" description="Admin portal" />
      <HeaderFooter isMobile={false}>
        <Flex
          direction="column"
          gap={8}
          p={{ base: 5, md: 10 }}
          minH="100vh"
          bg={pageBg}
        >
          {/* Page header */}
          <Box>
            <Badge
              colorScheme="teal"
              borderRadius="full"
              px={3}
              py={1}
              fontSize="xs"
              mb={2}
            >
              Admin
            </Badge>
            <Heading
              fontFamily="'Sora', sans-serif"
              size="xl"
              bgGradient="linear(to-r, teal.400, blue.500)"
              bgClip="text"
            >
              Admin Portal
            </Heading>
            <Text color={dim} mt={1} fontSize="sm">
              Select a section to manage your site content
            </Text>
          </Box>

          {/* Cards */}
          <SimpleGrid columns={[1, 2, 3]} gap={5}>
            {cards.map((c) => (
              <Box
                key={c.href}
                bg={cardBg}
                border="1px solid"
                borderColor={border}
                borderRadius="20px"
                backdropFilter="blur(14px)"
                p={6}
                cursor="pointer"
                position="relative"
                overflow="hidden"
                transition="transform 0.2s, box-shadow 0.2s"
                _hover={{ transform: 'translateY(-4px)', boxShadow: 'xl' }}
                onClick={() => router.push(c.href)}
              >
                {/* Gradient top accent */}
                <Box
                  position="absolute"
                  top={0}
                  left={0}
                  right={0}
                  h="3px"
                  bgImage={c.gradient}
                />
                <Flex align="center" gap={4} mb={4}>
                  <Flex
                    p={3}
                    borderRadius="12px"
                    bgImage={c.gradient}
                    color="white"
                    align="center"
                    justify="center"
                  >
                    <Icon as={c.icon} boxSize={5} />
                  </Flex>
                  <Badge
                    colorScheme={c.badgeColor}
                    borderRadius="full"
                    px={3}
                    variant="subtle"
                    fontSize="xs"
                  >
                    {c.badge}
                  </Badge>
                </Flex>
                <Heading size="sm" mb={2} fontFamily="'Sora', sans-serif">
                  {c.title}
                </Heading>
                <Text color={dim} fontSize="sm" mb={5} minH="40px">
                  {c.desc}
                </Text>
                <Button
                  size="sm"
                  borderRadius="10px"
                  bgImage={c.gradient}
                  color="white"
                  _hover={{ opacity: 0.88 }}
                  w="100%"
                >
                  Open
                </Button>
              </Box>
            ))}
          </SimpleGrid>
        </Flex>
      </HeaderFooter>
    </>
  )
}

