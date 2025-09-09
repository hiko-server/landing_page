import React, { useEffect, useState } from 'react'
import { Button, Flex, Heading, HStack, Tab, TabList, TabPanel, TabPanels, Tabs, Textarea, useToast } from '@chakra-ui/react'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'

export default function CVEditor() {
  const [isMobile] = [false]
  const toast = useToast()
  const [enText, setEnText] = useState('')
  const [zhText, setZhText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/cvdata')
        const data = await res.json()
        setEnText(JSON.stringify(data.en, null, 2))
        setZhText(JSON.stringify(data.zh, null, 2))
      } catch (e) {
        toast({ status: 'error', title: 'Failed to load CV data' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [toast])

  const save = async (syncZh: boolean) => {
    try {
      const en = JSON.parse(enText)
      const zh = JSON.parse(zhText)
      const res = await fetch('/api/cvdata', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ en, zh, syncZh }) })
      if (!res.ok) throw new Error('save failed')
      toast({ status: 'success', title: syncZh ? 'Saved with ZH synced' : 'Saved' })
    } catch (e) {
      toast({ status: 'error', title: 'Invalid JSON or unauthorized' })
    }
  }

  return (
    <>
      <CustomHead title="Edit CV" description="Edit CV data in EN/ZH and sync structure" />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" gap={4} p={6}>
          <Heading size="md">CV Data Editor</Heading>
          <HStack>
            <Button colorScheme="blue" onClick={() => save(false)} isDisabled={loading}>Save</Button>
            <Button onClick={() => save(true)} isDisabled={loading}>Save + Sync ZH Structure</Button>
          </HStack>
          <Tabs isFitted variant="enclosed">
            <TabList>
              <Tab>English (EN)</Tab>
              <Tab>中文 (ZH)</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <Textarea fontFamily="mono" minH="60vh" value={enText} onChange={(e) => setEnText(e.target.value)} />
              </TabPanel>
              <TabPanel>
                <Textarea fontFamily="mono" minH="60vh" value={zhText} onChange={(e) => setZhText(e.target.value)} />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Flex>
      </HeaderFooter>
    </>
  )
}
