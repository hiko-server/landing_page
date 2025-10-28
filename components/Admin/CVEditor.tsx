import React, { useEffect, useRef, useState } from 'react'
import { Button, Flex, Heading, HStack, Tab, TabList, TabPanel, TabPanels, Tabs, Textarea, useToast, Select, Input } from '@chakra-ui/react'

export default function CVEditor() {
  const toast = useToast()
  const [enText, setEnText] = useState('')
  const [zhText, setZhText] = useState('')
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<string[]>([])
  const [selectedSnap, setSelectedSnap] = useState<string>('')
  const fileRef = useRef<HTMLInputElement | null>(null)

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
      const parseRelaxed = (txt: string) => {
        // Trim BOM and normalize common full-width quotes used in CN input
        let s = txt.replace(/^\uFEFF/, '')
        s = s
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
        // Remove simple comments if pasted from JS-like sources
        s = s.replace(/\/\*[^]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1')
        // Remove trailing commas before } or ]
        s = s.replace(/,\s*(\}|\])/g, '$1')
        return JSON.parse(s)
      }

      const en = parseRelaxed(enText)
      const zh = parseRelaxed(zhText)
      const res = await fetch('/api/cvdata', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ en, zh, syncZh }) })
      if (!res.ok) throw new Error('save failed')
      toast({ status: 'success', title: syncZh ? 'Saved with ZH synced' : 'Saved' })
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : ''
      toast({ status: 'error', title: msg || 'Invalid JSON or unauthorized' })
    }
  }

  const refresh = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cvdata')
      const data = await res.json()
      setEnText(JSON.stringify(data.en, null, 2))
      setZhText(JSON.stringify(data.zh, null, 2))
    } catch {
      toast({ status: 'error', title: 'Failed to reload CV data' })
    } finally {
      setLoading(false)
    }
  }

  const makeSnapshot = async () => {
    const res = await fetch('/api/cvdata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'snapshot' }) })
    const data = await res.json().catch(()=>({}))
    if (res.ok) { toast({ status: 'success', title: `Snapshot saved: ${data.file}` }); listSnaps() }
    else toast({ status: 'error', title: data?.error || 'Snapshot failed' })
  }

  const listSnaps = async () => {
    const res = await fetch('/api/cvdata?snapshots=1')
    const data = await res.json().catch(()=>({ files: [] }))
    if (res.ok) setSnapshots(data.files || [])
  }

  const restoreSelected = async () => {
    if (!selectedSnap) { toast({ status: 'warning', title: 'Select a snapshot' }); return }
    const res = await fetch('/api/cvdata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', filename: selectedSnap }) })
    const data = await res.json().catch(()=>({}))
    if (res.ok) { toast({ status: 'success', title: 'Restored from snapshot' }); refresh() }
    else toast({ status: 'error', title: data?.error || 'Restore failed' })
  }

  const downloadCurrent = () => {
    window.location.href = '/api/cvdata?download=current'
  }

  const downloadSelected = () => {
    if (!selectedSnap) { toast({ status: 'warning', title: 'Select a snapshot' }); return }
    const u = '/api/cvdata?download=1&file=' + encodeURIComponent(selectedSnap)
    window.location.href = u
  }

  const onUpload = async (file: File) => {
    try {
      const text = await file.text()
      const normalized = text
        .replace(/^\uFEFF/, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\/\*[^]*?\*\//g, '')
        .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1')
        .replace(/,\s*(\}|\])/g, '$1')
      const json = JSON.parse(normalized)
      const res = await fetch('/api/cvdata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import', data: json }) })
      const data = await res.json().catch(()=>({}))
      if (res.ok) { toast({ status: 'success', title: 'Imported from file' }); refresh() }
      else toast({ status: 'error', title: data?.error || 'Import failed' })
    } catch {
      toast({ status: 'error', title: 'Invalid JSON file' })
    }
  }

  return (
    <Flex direction="column" gap={4}>
      <Heading size="sm">CV Data Editor</Heading>
      <HStack>
        <Button colorScheme="blue" onClick={() => save(false)} isDisabled={loading}>Save</Button>
        <Button onClick={() => save(true)} isDisabled={loading}>Save + Sync ZH Structure</Button>
        <Button onClick={refresh} isDisabled={loading}>Reload</Button>
      </HStack>
      <Heading size="sm">Snapshots</Heading>
      <HStack>
        <Button onClick={makeSnapshot}>Make Snapshot</Button>
        <Button onClick={downloadCurrent}>Download Current</Button>
        <Button onClick={listSnaps}>List Snapshots</Button>
        <Select placeholder="Select snapshot" width="auto" value={selectedSnap} onChange={(e)=> setSelectedSnap(e.target.value)}>
          {snapshots.map((f)=> <option key={f} value={f}>{f}</option>)}
        </Select>
        <Button onClick={restoreSelected} colorScheme='yellow'>Restore Selected</Button>
        <Button onClick={downloadSelected}>Download Selected</Button>
        <Input type='file' accept='application/json' display='none' ref={fileRef} onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUpload(f); if (fileRef.current) fileRef.current.value='' }} />
        <Button onClick={()=> fileRef.current?.click()}>Upload JSON</Button>
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
  )
}
