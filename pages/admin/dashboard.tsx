import React, { useEffect, useState } from 'react'
import { Flex, Heading, Tabs, TabList, Tab, TabPanels, TabPanel, Button, useToast } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import CVEditor from '../../components/Admin/CVEditor'
import CVGuiEditor from '../../components/Admin/CVGuiEditor'
import HomeEditor from '../../components/Admin/HomeEditor'
import { useRouter } from 'next/router'

export default function AdminDashboard() {
  const [isMobile] = [false]
  const toast = useToast()
  const router = useRouter()
  const [tabIndex, setTabIndex] = useState(0)

  useEffect(() => {
    if (!router.isReady) return
    const t = (router.query.tab as string) || ''
    if (t.toLowerCase() === 'cv') setTabIndex(1)
    else setTabIndex(0)
  }, [router.isReady, router.query.tab])
  const sendTest = async () => {
    try {
      const res = await fetch('/api/admin/test-mail', { method: 'POST' })
      const data = await res.json().catch(()=>({}))
      if (res.ok && !data.skipped) toast({ status: 'success', title: 'Test email sent' })
      else if (data.skipped) toast({ status: 'warning', title: 'SMTP not configured', description: 'Skipped send' })
      else toast({ status: 'error', title: 'Test failed', description: data?.error || 'Unknown error' })
    } catch (e:any) {
      toast({ status: 'error', title: 'Test failed', description: e?.message })
    }
  }
  return (
    <>
      <CustomHead title="Admin Dashboard" />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" p={6} gap={6}>
          <Heading size="md">Admin Dashboard</Heading>
          <Button alignSelf="start" onClick={sendTest}>Send test email</Button>
          <Tabs variant="enclosed" isFitted index={tabIndex} onChange={(i)=> setTabIndex(i)}>
            <TabList>
              <Tab>Home</Tab>
              <Tab>CV</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <HomeEditor />
              </TabPanel>
              <TabPanel>
                <Tabs variant='enclosed'>
                  <TabList>
                    <Tab>JSON</Tab>
                    <Tab>GUI</Tab>
                  </TabList>
                  <TabPanels>
                    <TabPanel>
                      <CVEditor />
                    </TabPanel>
                    <TabPanel>
                      <CVGuiEditor />
                    </TabPanel>
                  </TabPanels>
                </Tabs>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Flex>
      </HeaderFooter>
    </>
  )
}
