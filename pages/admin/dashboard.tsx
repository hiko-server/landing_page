import React, { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Icon,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react'
import { SettingsIcon } from '@chakra-ui/icons'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import CVEditor from '../../components/Admin/CVEditor'
import CVGuiEditor from '../../components/Admin/CVGuiEditorV2'
import CVEditorStudio from '../../components/Admin/CVEditorStudio'
import HomeEditor from '../../components/Admin/HomeEditor'
import VersionHistory from '../../components/Admin/VersionHistory'
import StoragePanel from '../../components/Admin/StoragePanel'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { FaHome, FaFileAlt, FaHistory, FaDatabase } from 'react-icons/fa'

const TAB_LABELS = ['Home', 'CV', 'Versions', 'Storage']

export default function AdminDashboard() {
  const toast = useToast()
  const router = useRouter()
  const [tabIndex, setTabIndex] = useState(0)
  const pageBg = useColorModeValue('gray.50', 'gray.900')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const tabBorder = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.1)')

  useEffect(() => {
    if (!router.isReady) return
    const t = ((router.query.tab as string) || '').toLowerCase()
    if (t === 'cv') setTabIndex(1)
    else if (t === 'versions' || t === 'history') setTabIndex(2)
    else if (t === 'storage') setTabIndex(3)
    else setTabIndex(0)
  }, [router.isReady, router.query.tab])

  const sendTest = async () => {
    try {
      const res = await fetch('/api/admin/test-mail', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.skipped) toast({ status: 'success', title: 'Test email sent' })
      else if (data.skipped)
        toast({ status: 'warning', title: 'SMTP not configured', description: 'Skipped send' })
      else toast({ status: 'error', title: 'Test failed', description: data?.error || 'Unknown error' })
    } catch (e: any) {
      toast({ status: 'error', title: 'Test failed', description: e?.message })
    }
  }

  const tabIcons = [FaHome, FaFileAlt, FaHistory, FaDatabase]
  const tabColors = ['blue.400', 'purple.400', 'orange.400', 'teal.400']

  return (
    <>
      <CustomHead title="Admin Dashboard" />
      <HeaderFooter isMobile={false}>
        <Flex direction="column" p={{ base: 4, md: 8 }} gap={6} minH="100vh" bg={pageBg}>
          {/* Header */}
          <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
            <Box>
              <Badge colorScheme="teal" borderRadius="full" px={3} py={1} fontSize="xs" mb={1}>
                Admin
              </Badge>
              <Heading
                fontFamily="'Sora', sans-serif"
                size="lg"
                bgGradient="linear(to-r, teal.400, blue.500)"
                bgClip="text"
              >
                Dashboard
              </Heading>
              <Text color={dim} fontSize="xs" mt={0.5}>
                {TAB_LABELS[tabIndex]} &mdash; manage and edit your site content
              </Text>
            </Box>
            <HStack spacing={3}>
              <Button size="sm" borderRadius="10px" variant="ghost" onClick={sendTest}>
                Test Email
              </Button>
              <Button
                as={Link}
                href="/admin/db-config"
                size="sm"
                leftIcon={<SettingsIcon />}
                colorScheme="purple"
                borderRadius="10px"
              >
                DB & Backup
              </Button>
            </HStack>
          </Flex>

          {/* Tabs */}
          <Tabs
            variant="unstyled"
            index={tabIndex}
            onChange={(i) => setTabIndex(i)}
            isFitted={false}
          >
            <TabList
              bg={useColorModeValue('rgba(255,255,255,0.8)', 'rgba(30,41,59,0.7)')}
              backdropFilter="blur(10px)"
              border="1px solid"
              borderColor={tabBorder}
              borderRadius="16px"
              p={1.5}
              display="inline-flex"
              gap={1}
              mb={6}
            >
              {TAB_LABELS.map((label, i) => (
                <Tab
                  key={label}
                  borderRadius="12px"
                  fontWeight={600}
                  fontSize="sm"
                  px={5}
                  py={2}
                  transition="all 0.2s"
                  color={dim}
                  _selected={{
                    bg: useColorModeValue('white', 'gray.700'),
                    color: tabColors[i],
                    boxShadow: 'md',
                  }}
                >
                  <HStack spacing={2}>
                    <Icon as={tabIcons[i]} boxSize={3.5} />
                    <Text>{label}</Text>
                  </HStack>
                </Tab>
              ))}
            </TabList>

            <TabPanels>
              {/* Home */}
              <TabPanel p={0}>
                <HomeEditor />
              </TabPanel>

              {/* CV — Studio is the primary v6 editor; JSON & GUI v2 are
                  kept as legacy power-user tabs for raw editing / debugging. */}
              <TabPanel p={0}>
                <Tabs variant="enclosed" colorScheme="purple">
                  <TabList>
                    <Tab>Studio</Tab>
                    <Tab>JSON</Tab>
                    <Tab>GUI (legacy)</Tab>
                  </TabList>
                  <TabPanels>
                    <TabPanel p={0}>
                      <CVEditorStudio />
                    </TabPanel>
                    <TabPanel>
                      <CVEditor />
                    </TabPanel>
                    <TabPanel>
                      <CVGuiEditor />
                    </TabPanel>
                  </TabPanels>
                </Tabs>
              </TabPanel>

              {/* Versions */}
              <TabPanel p={0}>
                <VersionHistory />
              </TabPanel>

              {/* Storage — local SQLite + R2 inventory */}
              <TabPanel p={0}>
                <StoragePanel />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Flex>
      </HeaderFooter>
    </>
  )
}
