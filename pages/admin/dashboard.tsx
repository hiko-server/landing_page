import React, { useEffect, useState } from 'react'
import {
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
import CVEditorStudio from '../../components/Admin/CVEditorStudio'
import HomeEditor from '../../components/Admin/HomeEditor'
import VersionHistory from '../../components/Admin/VersionHistory'
import StoragePanel from '../../components/Admin/StoragePanel'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { FaHome, FaFileAlt, FaHistory, FaDatabase } from 'react-icons/fa'

const TAB_LABELS = ['Home', 'CV', 'Versions', 'Storage']
const TAB_KEYS = ['home', 'cv', 'versions', 'storage']

export default function AdminDashboard() {
  const toast = useToast()
  const router = useRouter()
  const [tabIndex, setTabIndex] = useState(0)
  const pageBg = useColorModeValue('gray.50', 'gray.900')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const tabBorder = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.1)')
  // Hooks must not be called inside the TAB_LABELS.map() callback below (the
  // hook-count would change with the list) — resolve the selected-tab bg once here.
  const tabSelectedBg = useColorModeValue('white', 'gray.700')

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
  const tabColors = ['var(--accent)', 'var(--accent)', 'var(--accent)', 'var(--accent)']

  return (
    <>
      <CustomHead title="Admin Dashboard" />
      <HeaderFooter>
        <Flex direction="column" p={{ base: 4, md: 8 }} gap={6} minH="100vh" bg={pageBg}>
          {/* Header */}
          <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
            <Box>
              <Text
                fontFamily="var(--font-geist-mono), monospace"
                fontSize="10px"
                letterSpacing="0.16em"
                textTransform="uppercase"
                color="var(--accent)"
                mb={1}
              >
                Admin
              </Text>
              <Heading
                size="lg"
                letterSpacing="-0.02em"
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
            onChange={(i) => {
              setTabIndex(i)
              // Keep ?tab= in sync so reloads / shared links land on the same tab.
              router.replace({ pathname: router.pathname, query: { ...router.query, tab: TAB_KEYS[i] } }, undefined, {
                shallow: true,
                scroll: false,
              })
            }}
            isFitted={false}
            // Only the visible editor is mounted: each editor owns keyboard
            // shortcuts and its own copy of the data, so hidden ones must not
            // listen or later overwrite a newer save.
            isLazy
            lazyBehavior="unmount"
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
              maxW="100%"
              overflowX="auto"
              sx={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
            >
              {TAB_LABELS.map((label, i) => (
                <Tab
                  key={label}
                  flexShrink={0}
                  borderRadius="12px"
                  fontWeight={600}
                  fontSize="sm"
                  px={5}
                  py={2}
                  transition="all 0.2s"
                  color={dim}
                  _selected={{
                    bg: tabSelectedBg,
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

              {/* CV — Studio is the editor; raw JSON stays for power users. */}
              <TabPanel p={0}>
                <Tabs variant="soft-rounded" colorScheme="purple" size="sm" isLazy lazyBehavior="unmount">
                  <TabList mb={3} gap={1}>
                    <Tab>Studio</Tab>
                    <Tab>Raw JSON</Tab>
                  </TabList>
                  <TabPanels>
                    <TabPanel p={0}>
                      <CVEditorStudio />
                    </TabPanel>
                    <TabPanel p={0}>
                      <CVEditor />
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
