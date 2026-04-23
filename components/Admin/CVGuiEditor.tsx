import { useEffect, useState, useRef } from 'react'
import {
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Textarea,
  useToast,
  IconButton,
  Switch,
  Text,
  Select,
  Box,
  VStack,
  Flex,
} from '@chakra-ui/react'
import { AddIcon, DeleteIcon, ArrowUpIcon, ArrowDownIcon } from '@chakra-ui/icons'

type PersonalInformation = {
  sessionName: string
  headerName: string
  firstName: string
  lastName: string
  nickName: string
  email: string
  phoneNumber: string
  personalWebsite: string
  address: string
  introduction: string
  hiddenFields?: string[]
  separatorColor?: string
}

type EducationExperience = {
  schoolName: string
  schoolLocation: string
  degree: string
  major: string
  startDate: string
  endDate: string
  gpa?: string
}

type CompetitionAward = {
  contestName: string
  award: string
  organization?: string
  date: string
  location?: string
  description: string[]
}

export default function CVGuiEditor() {
  const toast = useToast()
  const [pi, setPi] = useState<PersonalInformation | null>(null)
  const [edu, setEdu] = useState<EducationExperience[]>([])
  const [extra, setExtra] = useState<string[]>([])
  const [zPi, setZPi] = useState<PersonalInformation | null>(null)
  const [zEdu, setZEdu] = useState<EducationExperience[]>([])
  const [zExtra, setZExtra] = useState<string[]>([])
  const [bilingual, setBilingual] = useState<boolean>(false)
  const [languages, setLanguages] = useState<
    { language: string; level: string }[]
  >([])
  const [technical, setTechnical] = useState<
    { name: string; description: string[] }[]
  >([])
  const [projects, setProjects] = useState<
    Array<{
      title: string
      startDate: string
      endDate: string
      projectLocation: string
      description: string
      features: { description: string; furtherExplanation: string[] }[]
    }>
  >([])
  const [experiences, setExperiences] = useState<
    Array<{
      companyName: string
      companyURL: string
      jobTitle: string
      jobDescription: string
      location: string
      startDate: string
      endDate: string
      relatedSkills: string[]
      features: { description: string; furtherExplanation: string[] }[]
    }>
  >([])
  const [certs, setCerts] = useState<
    Array<{
      issuingOrganization: string
      organizationURL: string
      CertificationList: {
        certificationName: string
        issuedDate: string
        expirationDate: string
        credentialID: string
        credentialURL: string
      }[]
    }>
  >([])
  const [awards, setAwards] = useState<CompetitionAward[]>([])
  const [zAwards, setZAwards] = useState<CompetitionAward[]>([])
  const [snapshots, setSnapshots] = useState<string[]>([])
  const [selectedSnap, setSelectedSnap] = useState('')
  const [structure, setStructure] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/cvdata')
      const data = await res.json()
      const en = Array.isArray(data.en) ? data.en : []
      setStructure(en)
      const personal =
        en.find((s: any) => s.sessionName === 'personalInformation') || null
      const education = en.find((s: any) => s.sessionName === 'education') || {
        educationExperience: [],
      }
      const extraSkill = en.find(
        (s: any) => s.sessionName === 'extraSkill'
      ) || { points: [] }
      const skill = en.find((s: any) => s.sessionName === 'skill') || {
        languages: [],
        technical: [],
      }
      const project = en.find((s: any) => s.sessionName === 'project') || {
        projectExperience: [],
      }
      const work = en.find((s: any) => s.sessionName === 'workExperience') || {
        experiences: [],
      }
      const certification = en.find(
        (s: any) => s.sessionName === 'certification'
      ) || { certifications: [] }
      const competition = en.find(
        (s: any) => s.sessionName === 'competitionAwards'
      ) || { awards: [] }
      setPi(personal)
      setEdu(education.educationExperience || [])
      setExtra(extraSkill.points || [])
      setLanguages(skill.languages || [])
      setTechnical(skill.technical || [])
      setProjects(project.projectExperience || [])
      setExperiences(work.experiences || [])
      setCerts(certification.certifications || [])
      setAwards(competition.awards || [])

      const zpersonal =
        data.zh.find((s: any) => s.sessionName === 'personalInformation') ||
        null
      const zeducation = data.zh.find(
        (s: any) => s.sessionName === 'education'
      ) || { educationExperience: [] }
      const zextraSkill = data.zh.find(
        (s: any) => s.sessionName === 'extraSkill'
      ) || { points: [] }
      const zcompetition = data.zh.find(
        (s: any) => s.sessionName === 'competitionAwards'
      ) || { awards: [] }
      setZPi(zpersonal)
      setZEdu(zeducation.educationExperience || [])
      setZExtra(zextraSkill.points || [])
      setZAwards(zcompetition.awards || [])

      try {
        const sres = await fetch('/api/cvdata?snapshots=1')
        if (sres.ok) {
          const js = await sres.json()
          setSnapshots(js.files || [])
        }
      } catch {}
    }
    load()
  }, [])

  const listSnaps = async () => {
    const res = await fetch('/api/cvdata?snapshots=1')
    const data = await res.json().catch(() => ({ files: [] }))
    if (res.ok) setSnapshots(data.files || [])
  }
  const makeSnapshot = async () => {
    const res = await fetch('/api/cvdata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'snapshot' }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      toast({ status: 'success', title: `Snapshot saved: ${data.file}` })
      listSnaps()
    } else toast({ status: 'error', title: data?.error || 'Snapshot failed' })
  }
  const restoreSelected = async () => {
    if (!selectedSnap) {
      toast({ status: 'warning', title: 'Select a snapshot' })
      return
    }
    const res = await fetch('/api/cvdata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', filename: selectedSnap }),
    })
    const ok = res.ok
    if (ok) {
      toast({ status: 'success', title: 'Restored' })
      window.location.reload()
    } else toast({ status: 'error', title: 'Restore failed' })
  }
  const downloadCurrent = () => {
    window.location.href = '/api/cvdata?download=current'
  }
  const downloadSelected = () => {
    if (!selectedSnap) {
      toast({ status: 'warning', title: 'Select a snapshot' })
      return
    }
    window.location.href =
      '/api/cvdata?download=1&file=' + encodeURIComponent(selectedSnap)
  }
  const onUpload = async (file: File) => {
    try {
      const text = await file.text()
      // Normalize common CN punctuation and trailing commas for robustness
      const normalized = text
        .replace(/^\uFEFF/, '')
        .replace(/[“”]/g, "'")
        .replace(/[‘’]/g, "'")
        .replace(/\/\*[^]*?\*\//g, '')
        .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1')
        .replace(/,\s*(\}|\])/g, '$1')
      const json = JSON.parse(normalized)
      const res = await fetch('/api/cvdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', data: json }),
      })
      if (res.ok) {
        toast({ status: 'success', title: 'Imported' })
        window.location.reload()
      } else toast({ status: 'error', title: 'Import failed' })
    } catch {
      toast({ status: 'error', title: 'Invalid JSON file' })
    }
  }

  const save = async (syncZh: boolean, includeZh?: boolean) => {
    try {
      const res = await fetch('/api/cvdata')
      const remote = await res.json()
      // Use local structure order and visibility
      let en = structure.map((s: any) => {
        if (s.sessionName === 'personalInformation') return { ...s, ...pi, isVisible: s.isVisible !== false, hiddenFields: pi?.hiddenFields }
        if (s.sessionName === 'education')
          return { ...s, educationExperience: edu, isVisible: s.isVisible !== false }
        if (s.sessionName === 'extraSkill') return { ...s, points: extra, isVisible: s.isVisible !== false }
        if (s.sessionName === 'skill') return { ...s, languages, technical, isVisible: s.isVisible !== false }
        if (s.sessionName === 'project')
          return { ...s, projectExperience: projects, isVisible: s.isVisible !== false }
        if (s.sessionName === 'workExperience') return { ...s, experiences, isVisible: s.isVisible !== false }
        if (s.sessionName === 'competitionAwards')
          return { ...s, awards, isVisible: s.isVisible !== false }
        if (s.sessionName === 'certification')
          return { ...s, certifications: certs, isVisible: s.isVisible !== false }
        return s
      })
      let zh = remote.zh
      if (includeZh) {
        zh = zh.map((s: any) => {
          if (s.sessionName === 'personalInformation') return zPi
          if (s.sessionName === 'education')
            return { ...s, educationExperience: zEdu }
          if (s.sessionName === 'extraSkill') return { ...s, points: zExtra }
          if (s.sessionName === 'competitionAwards')
            return { ...s, awards: zAwards }
          return s
        })
      }
      const r = await fetch('/api/cvdata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ en, zh, syncZh }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data?.error || `Save failed (${r.status})`)
      }
      toast({
        status: 'success',
        title: syncZh ? 'Saved (ZH synced)' : 'Saved',
      })
    } catch (e: any) {
      toast({ status: 'error', title: e?.message || 'Save failed' })
    }
  }

  return (
    <>
      <Heading size="sm" mb={2}>
        Snapshots
      </Heading>
      <HStack mb={4} spacing={3}>
        <Button onClick={makeSnapshot}>Make Snapshot</Button>
        <Button onClick={downloadCurrent}>Download Current</Button>
        <Button onClick={listSnaps}>List Snapshots</Button>
        <Select
          placeholder="Select snapshot"
          width="auto"
          value={selectedSnap}
          onChange={(e) => setSelectedSnap(e.target.value)}
        >
          {snapshots.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Button onClick={restoreSelected} colorScheme="yellow">
          Restore Selected
        </Button>
        <Button onClick={downloadSelected}>Download Selected</Button>
        <Input
          type="file"
          accept="application/json"
          display="none"
          ref={fileRef}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />
        <Button onClick={() => fileRef.current?.click()}>Upload JSON</Button>
      </HStack>
      <HStack mb={3} align="center">
        <Switch
          isChecked={bilingual}
          onChange={(e) => setBilingual(e.target.checked)}
        />
        <Text>双语模式（EN/ZH 对照：个人信息/教育/技能要点）</Text>
        <Button
          size="sm"
          onClick={async () => {
            try {
              const res = await fetch('/api/cvdata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'snapshot' }),
              })
              const js = await res.json()
              if (res.ok) {
                setSnapshots([js.file, ...snapshots])
                toast({ status: 'success', title: 'Snapshot created' })
              } else {
                toast({
                  status: 'error',
                  title: js?.error || 'Snapshot failed',
                })
              }
            } catch (e: any) {
              toast({ status: 'error', title: e?.message || 'Snapshot failed' })
            }
          }}
        >
          Create Snapshot
        </Button>
      </HStack>
      {snapshots.length > 0 && (
        <Table size="sm" variant="simple" mb={4}>
          <Thead>
            <Tr>
              <Th>Snapshot</Th>
              <Th>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {snapshots.map((f) => (
              <Tr key={f}>
                <Td>{f}</Td>
                <Td>
                  <Button
                    size="xs"
                    onClick={async () => {
                      if (!confirm(`Restore ${f}?`)) return
                      const res = await fetch('/api/cvdata', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'restore',
                          filename: f,
                        }),
                      })
                      const js = await res.json()
                      if (res.ok) {
                        toast({ status: 'success', title: 'Restored' })
                        window.location.reload()
                      } else {
                        toast({
                          status: 'error',
                          title: js?.error || 'Restore failed',
                        })
                      }
                    }}
                  >
                    Restore
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Heading size="sm">Structure</Heading>
      <Box p={4} border="1px" borderColor="gray.200" borderRadius="md" mb={6}>
        <VStack align="stretch" spacing={2}>
          {structure.map((section: any, index: number) => (
            <Flex direction="column" key={index} p={2} bg="gray.50" borderRadius="md" gap={2}>
              <HStack justify="space-between">
                <HStack>
                  <Switch
                    isChecked={section.isVisible !== false}
                    onChange={(e) => {
                      const newStructure = [...structure]
                      newStructure[index] = { ...newStructure[index], isVisible: e.target.checked }
                      setStructure(newStructure)
                    }}
                  />
                  <Text fontWeight="bold">{section.headerName}</Text>
                  <Text fontSize="sm" color="gray.500">({section.sessionName})</Text>
                </HStack>
                <HStack>
                  <IconButton
                    aria-label="Move Up"
                    icon={<ArrowUpIcon />}
                    size="xs"
                    isDisabled={index === 0}
                    onClick={() => {
                      const newStructure = [...structure]
                      const temp = newStructure[index - 1]
                      newStructure[index - 1] = newStructure[index]
                      newStructure[index] = temp
                      setStructure(newStructure)
                    }}
                  />
                  <IconButton
                    aria-label="Move Down"
                    icon={<ArrowDownIcon />}
                    size="xs"
                    isDisabled={index === structure.length - 1}
                    onClick={() => {
                      const newStructure = [...structure]
                      const temp = newStructure[index + 1]
                      newStructure[index + 1] = newStructure[index]
                      newStructure[index] = temp
                      setStructure(newStructure)
                    }}
                  />
                </HStack>
              </HStack>
              {section.sessionName === 'personalInformation' && pi && (
                <Flex wrap="wrap" gap={4} pl={8} pt={2} borderTop="1px" borderColor="gray.200">
                  {['firstName', 'lastName', 'nickName', 'email', 'phoneNumber', 'personalWebsite', 'address', 'introduction'].map(field => {
                    const isHidden = pi.hiddenFields?.includes(field)
                    return (
                      <HStack key={field}>
                        <Switch
                          size="sm"
                          isChecked={!isHidden}
                          onChange={(e) => {
                            const currentHidden = pi.hiddenFields || []
                            let newHidden
                            if (e.target.checked) {
                              newHidden = currentHidden.filter(f => f !== field)
                            } else {
                              newHidden = [...currentHidden, field]
                            }
                            setPi({ ...pi, hiddenFields: newHidden })
                          }}
                        />
                        <Text fontSize="xs">{field}</Text>
                      </HStack>
                    )
                  })}
                </Flex>
              )}
            </Flex>
          ))}
        </VStack>
      </Box>

      <Heading size="sm" mb={3}>
        Personal Information
      </Heading>
      {pi && (
        <SimpleGrid columns={[1, 2]} gap={4}>
          <FormControl>
            <FormLabel>First Name</FormLabel>
            <Input
              value={pi.firstName}
              onChange={(e) => setPi({ ...pi, firstName: e.target.value })}
            />
          </FormControl>
          {bilingual && (
            <FormControl>
              <FormLabel>First Name (ZH)</FormLabel>
              <Input
                value={zPi?.firstName || ''}
                onChange={(e) =>
                  setZPi({ ...(zPi || pi!), firstName: e.target.value })
                }
              />
            </FormControl>
          )}
          <FormControl>
            <FormLabel>Last Name</FormLabel>
            <Input
              value={pi.lastName}
              onChange={(e) => setPi({ ...pi, lastName: e.target.value })}
            />
          </FormControl>
          {bilingual && (
            <FormControl>
              <FormLabel>Last Name (ZH)</FormLabel>
              <Input
                value={zPi?.lastName || ''}
                onChange={(e) =>
                  setZPi({ ...(zPi || pi!), lastName: e.target.value })
                }
              />
            </FormControl>
          )}
          <FormControl>
            <FormLabel>Nick Name</FormLabel>
            <Input
              value={pi.nickName}
              onChange={(e) => setPi({ ...pi, nickName: e.target.value })}
            />
          </FormControl>
          {bilingual && (
            <FormControl>
              <FormLabel>Nick Name (ZH)</FormLabel>
              <Input
                value={zPi?.nickName || ''}
                onChange={(e) =>
                  setZPi({ ...(zPi || pi!), nickName: e.target.value })
                }
              />
            </FormControl>
          )}
          <FormControl>
            <FormLabel>Email</FormLabel>
            <Input
              value={pi.email}
              onChange={(e) => setPi({ ...pi, email: e.target.value })}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Phone</FormLabel>
            <Input
              value={pi.phoneNumber}
              onChange={(e) => setPi({ ...pi, phoneNumber: e.target.value })}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Website</FormLabel>
            <Input
              value={pi.personalWebsite}
              onChange={(e) =>
                setPi({ ...pi, personalWebsite: e.target.value })
              }
            />
          </FormControl>
          <FormControl gridColumn="1 / -1">
            <FormLabel>Address</FormLabel>
            <Input
              value={pi.address}
              onChange={(e) => setPi({ ...pi, address: e.target.value })}
            />
          </FormControl>
          {bilingual && (
            <FormControl gridColumn="1 / -1">
              <FormLabel>Address (ZH)</FormLabel>
              <Input
                value={zPi?.address || ''}
                onChange={(e) =>
                  setZPi({ ...(zPi || pi!), address: e.target.value })
                }
              />
            </FormControl>
          )}
          <FormControl gridColumn="1 / -1">
            <FormLabel>Introduction</FormLabel>
            <Textarea
              value={pi.introduction}
              onChange={(e) => setPi({ ...pi, introduction: e.target.value })}
            />
          </FormControl>
          {bilingual && (
            <FormControl gridColumn="1 / -1">
              <FormLabel>Introduction (ZH)</FormLabel>
              <Textarea
                value={zPi?.introduction || ''}
                onChange={(e) =>
                  setZPi({ ...(zPi || pi!), introduction: e.target.value })
                }
              />
            </FormControl>
          )}
          <FormControl>
            <FormLabel>Separator Color</FormLabel>
            <HStack>
              <Input
                type="color"
                w="50px"
                p={1}
                value={pi.separatorColor || '#0000ff'}
                onChange={(e) => setPi({ ...pi, separatorColor: e.target.value })}
              />
              <Input
                value={pi.separatorColor || ''}
                onChange={(e) => setPi({ ...pi, separatorColor: e.target.value })}
                placeholder="CSS Color (e.g. blue, #123456)"
              />
            </HStack>
          </FormControl>
        </SimpleGrid>
      )}

      <Heading size="sm" mt={6} mb={2}>
        Education
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>School</Th>
            <Th>Location</Th>
            <Th>Degree</Th>
            <Th>Major</Th>
            <Th>Start</Th>
            <Th>End</Th>
            <Th>GPA</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {edu.map((e, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={e.schoolName}
                  onChange={(ev) => {
                    const arr = [...edu]
                    arr[i] = { ...arr[i], schoolName: ev.target.value }
                    setEdu(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={e.schoolLocation}
                  onChange={(ev) => {
                    const arr = [...edu]
                    arr[i] = { ...arr[i], schoolLocation: ev.target.value }
                    setEdu(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={e.degree}
                  onChange={(ev) => {
                    const arr = [...edu]
                    arr[i] = { ...arr[i], degree: ev.target.value }
                    setEdu(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={e.major}
                  onChange={(ev) => {
                    const arr = [...edu]
                    arr[i] = { ...arr[i], major: ev.target.value }
                    setEdu(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={e.startDate}
                  onChange={(ev) => {
                    const arr = [...edu]
                    arr[i] = { ...arr[i], startDate: ev.target.value }
                    setEdu(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={e.endDate}
                  onChange={(ev) => {
                    const arr = [...edu]
                    arr[i] = { ...arr[i], endDate: ev.target.value }
                    setEdu(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={e.gpa || ''}
                  onChange={(ev) => {
                    const arr = [...edu]
                    arr[i] = { ...arr[i], gpa: ev.target.value }
                    setEdu(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() => setEdu(edu.filter((_, x) => x !== i))}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() =>
          setEdu([
            ...edu,
            {
              schoolName: '',
              schoolLocation: '',
              degree: '',
              major: '',
              startDate: '',
              endDate: '',
              gpa: '',
            },
          ])
        }
      >
        Add Education
      </Button>

      <Heading size="sm" mt={6} mb={2}>
        Extra Skills
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Point</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {extra.map((p, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={p}
                  onChange={(ev) => {
                    const arr = [...extra]
                    arr[i] = ev.target.value
                    setExtra(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() => setExtra(extra.filter((_, x) => x !== i))}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() => setExtra([...extra, ''])}
      >
        Add Point
      </Button>

      <Heading size="sm" mt={6} mb={2}>
        Skills
      </Heading>
      <Heading size="xs" mb={1}>
        Languages
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Language</Th>
            <Th>Level</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {languages.map((l, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={l.language}
                  onChange={(ev) => {
                    const arr = [...languages]
                    arr[i] = { ...arr[i], language: ev.target.value }
                    setLanguages(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={l.level}
                  onChange={(ev) => {
                    const arr = [...languages]
                    arr[i] = { ...arr[i], level: ev.target.value }
                    setLanguages(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() =>
                    setLanguages(languages.filter((_, x) => x !== i))
                  }
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() =>
          setLanguages([...languages, { language: '', level: '' }])
        }
      >
        Add Language
      </Button>

      <Heading size="xs" mt={4} mb={1}>
        Technical
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Name</Th>
            <Th>Description (one per line)</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {technical.map((t, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={t.name}
                  onChange={(ev) => {
                    const arr = [...technical]
                    arr[i] = { ...arr[i], name: ev.target.value }
                    setTechnical(arr)
                  }}
                />
              </Td>
              <Td>
                <Textarea
                  value={(t.description || []).join('\n')}
                  onChange={(ev) => {
                    const arr = [...technical]
                    arr[i] = {
                      ...arr[i],
                      description: ev.target.value.split('\n'),
                    }
                    setTechnical(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() =>
                    setTechnical(technical.filter((_, x) => x !== i))
                  }
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() =>
          setTechnical([...technical, { name: '', description: [] }])
        }
      >
        Add Technical
      </Button>

      <Heading size="sm" mt={6} mb={2}>
        Projects
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Title</Th>
            <Th>Start</Th>
            <Th>End</Th>
            <Th>Location</Th>
            <Th>Description</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {projects.map((p, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={p.title}
                  onChange={(ev) => {
                    const arr = [...projects]
                    arr[i] = { ...arr[i], title: ev.target.value }
                    setProjects(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={p.startDate}
                  onChange={(ev) => {
                    const arr = [...projects]
                    arr[i] = { ...arr[i], startDate: ev.target.value }
                    setProjects(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={p.endDate}
                  onChange={(ev) => {
                    const arr = [...projects]
                    arr[i] = { ...arr[i], endDate: ev.target.value }
                    setProjects(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={p.projectLocation}
                  onChange={(ev) => {
                    const arr = [...projects]
                    arr[i] = { ...arr[i], projectLocation: ev.target.value }
                    setProjects(arr)
                  }}
                />
              </Td>
              <Td>
                <Textarea
                  value={p.description}
                  onChange={(ev) => {
                    const arr = [...projects]
                    arr[i] = { ...arr[i], description: ev.target.value }
                    setProjects(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() =>
                    setProjects(projects.filter((_, x) => x !== i))
                  }
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() =>
          setProjects([
            ...projects,
            {
              title: '',
              startDate: '',
              endDate: '',
              projectLocation: '',
              description: '',
              features: [],
            },
          ])
        }
      >
        Add Project
      </Button>

      <Heading size="xs" mt={3} mb={1}>
        Project Features
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Project Index</Th>
            <Th>Feature Description</Th>
            <Th>Explanations (one per line)</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {projects.flatMap((p, pi) =>
            p.features.map((f, fi) => (
              <Tr key={`${pi}-${fi}`}>
                <Td>{pi + 1}</Td>
                <Td>
                  <Input
                    value={f.description}
                    onChange={(ev) => {
                      const arr = [...projects]
                      arr[pi].features[fi].description = ev.target.value
                      setProjects(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Textarea
                    value={(f.furtherExplanation || []).join('\n')}
                    onChange={(ev) => {
                      const arr = [...projects]
                      arr[pi].features[fi].furtherExplanation =
                        ev.target.value.split('\n')
                      setProjects(arr)
                    }}
                  />
                </Td>
                <Td>
                  <IconButton
                    aria-label="delete"
                    icon={<DeleteIcon />}
                    onClick={() => {
                      const arr = [...projects]
                      arr[pi].features = arr[pi].features.filter(
                        (_, x) => x !== fi
                      )
                      setProjects(arr)
                    }}
                  />
                </Td>
              </Tr>
            ))
          )}
        </Tbody>
      </Table>
      <HStack mt={2}>
        <Input
          placeholder="Project index (1-based)"
          width="200px"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const idx = Number((e.target as HTMLInputElement).value) - 1
              if (idx >= 0 && idx < projects.length) {
                const arr = [...projects]
                arr[idx].features.push({
                  description: '',
                  furtherExplanation: [],
                })
                setProjects(arr)
              }
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
        <Button
          size="sm"
          onClick={() => {
            if (projects.length === 0) {
              toast({ status: 'error', title: 'Add a project first' })
              return
            }
            const arr = [...projects]
            arr[projects.length - 1].features.push({
              description: '',
              furtherExplanation: [],
            })
            setProjects(arr)
          }}
        >
          Add Feature (last project)
        </Button>
      </HStack>

      <Heading size="sm" mt={6} mb={2}>
        Work Experiences
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Company</Th>
            <Th>URL</Th>
            <Th>Job Title</Th>
            <Th>Location</Th>
            <Th>Start</Th>
            <Th>End</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {experiences.map((x, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={x.companyName}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = { ...arr[i], companyName: ev.target.value }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={x.companyURL}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = { ...arr[i], companyURL: ev.target.value }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={x.jobTitle}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = { ...arr[i], jobTitle: ev.target.value }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={x.location}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = { ...arr[i], location: ev.target.value }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={x.startDate}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = { ...arr[i], startDate: ev.target.value }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={x.endDate}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = { ...arr[i], endDate: ev.target.value }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() =>
                    setExperiences(experiences.filter((_, y) => y !== i))
                  }
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() =>
          setExperiences([
            ...experiences,
            {
              companyName: '',
              companyURL: '',
              jobTitle: '',
              jobDescription: '',
              location: '',
              startDate: '',
              endDate: '',
              relatedSkills: [],
              features: [],
            },
          ])
        }
      >
        Add Experience
      </Button>

      <Heading size="xs" mt={3} mb={1}>
        Experience Details
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Idx</Th>
            <Th>Job Description</Th>
            <Th>Related Skills (comma)</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {experiences.map((x, i) => (
            <Tr key={i}>
              <Td>{i + 1}</Td>
              <Td>
                <Textarea
                  value={x.jobDescription}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = { ...arr[i], jobDescription: ev.target.value }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={(x.relatedSkills || []).join(', ')}
                  onChange={(ev) => {
                    const arr = [...experiences]
                    arr[i] = {
                      ...arr[i],
                      relatedSkills: ev.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }
                    setExperiences(arr)
                  }}
                />
              </Td>
              <Td></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Heading size="xs" mt={3} mb={1}>
        Experience Features
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Exp Idx</Th>
            <Th>Description</Th>
            <Th>Explanations (one per line)</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {experiences.flatMap((x, xi) =>
            x.features.map((f, fi) => (
              <Tr key={`${xi}-${fi}`}>
                <Td>{xi + 1}</Td>
                <Td>
                  <Input
                    value={f.description}
                    onChange={(ev) => {
                      const arr = [...experiences]
                      arr[xi].features[fi].description = ev.target.value
                      setExperiences(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Textarea
                    value={(f.furtherExplanation || []).join('\n')}
                    onChange={(ev) => {
                      const arr = [...experiences]
                      arr[xi].features[fi].furtherExplanation =
                        ev.target.value.split('\n')
                      setExperiences(arr)
                    }}
                  />
                </Td>
                <Td>
                  <IconButton
                    aria-label="delete"
                    icon={<DeleteIcon />}
                    onClick={() => {
                      const arr = [...experiences]
                      arr[xi].features = arr[xi].features.filter(
                        (_, y) => y !== fi
                      )
                      setExperiences(arr)
                    }}
                  />
                </Td>
              </Tr>
            ))
          )}
        </Tbody>
      </Table>
      <HStack mt={2}>
        <Input
          placeholder="Experience index (1-based)"
          width="240px"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const idx = Number((e.target as HTMLInputElement).value) - 1
              if (idx >= 0 && idx < experiences.length) {
                const arr = [...experiences]
                arr[idx].features.push({
                  description: '',
                  furtherExplanation: [],
                })
                setExperiences(arr)
              }
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
        <Button
          size="sm"
          onClick={() => {
            if (experiences.length === 0) {
              toast({ status: 'error', title: 'Add an experience first' })
              return
            }
            const arr = [...experiences]
            arr[experiences.length - 1].features.push({
              description: '',
              furtherExplanation: [],
            })
            setExperiences(arr)
          }}
        >
          Add Feature (last)
        </Button>
      </HStack>

      <Heading size="sm" mt={6} mb={2}>
        Competition Awards
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Contest</Th>
            <Th>Award</Th>
            <Th>Organization</Th>
            <Th>Date</Th>
            <Th>Location</Th>
            <Th>Description (one per line)</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {awards.map((award, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={award.contestName || ''}
                  onChange={(ev) => {
                    const arr = [...awards]
                    arr[i] = { ...arr[i], contestName: ev.target.value }
                    setAwards(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={award.award || ''}
                  onChange={(ev) => {
                    const arr = [...awards]
                    arr[i] = { ...arr[i], award: ev.target.value }
                    setAwards(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={award.organization || ''}
                  onChange={(ev) => {
                    const arr = [...awards]
                    arr[i] = { ...arr[i], organization: ev.target.value }
                    setAwards(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={award.date || ''}
                  onChange={(ev) => {
                    const arr = [...awards]
                    arr[i] = { ...arr[i], date: ev.target.value }
                    setAwards(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={award.location || ''}
                  onChange={(ev) => {
                    const arr = [...awards]
                    arr[i] = { ...arr[i], location: ev.target.value }
                    setAwards(arr)
                  }}
                />
              </Td>
              <Td>
                <Textarea
                  value={(award.description || []).join('\n')}
                  onChange={(ev) => {
                    const arr = [...awards]
                    arr[i] = {
                      ...arr[i],
                      description: ev.target.value.split('\n'),
                    }
                    setAwards(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() =>
                    setAwards(awards.filter((_, index) => index !== i))
                  }
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() =>
          setAwards([
            ...awards,
            {
              contestName: '',
              award: '',
              organization: '',
              date: '',
              location: '',
              description: [],
            },
          ])
        }
      >
        Add Award
      </Button>

      {bilingual && (
        <>
          <Heading size="sm" mt={6} mb={2}>
            比赛与奖项（ZH）
          </Heading>
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th>比赛名称</Th>
                <Th>奖项</Th>
                <Th>主办机构</Th>
                <Th>日期</Th>
                <Th>地点</Th>
                <Th>描述（每行一条）</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {zAwards.map((award, i) => (
                <Tr key={`zh-${i}`}>
                  <Td>
                    <Input
                      value={award.contestName || ''}
                      onChange={(ev) => {
                        const arr = [...zAwards]
                        arr[i] = { ...arr[i], contestName: ev.target.value }
                        setZAwards(arr)
                      }}
                    />
                  </Td>
                  <Td>
                    <Input
                      value={award.award || ''}
                      onChange={(ev) => {
                        const arr = [...zAwards]
                        arr[i] = { ...arr[i], award: ev.target.value }
                        setZAwards(arr)
                      }}
                    />
                  </Td>
                  <Td>
                    <Input
                      value={award.organization || ''}
                      onChange={(ev) => {
                        const arr = [...zAwards]
                        arr[i] = { ...arr[i], organization: ev.target.value }
                        setZAwards(arr)
                      }}
                    />
                  </Td>
                  <Td>
                    <Input
                      value={award.date || ''}
                      onChange={(ev) => {
                        const arr = [...zAwards]
                        arr[i] = { ...arr[i], date: ev.target.value }
                        setZAwards(arr)
                      }}
                    />
                  </Td>
                  <Td>
                    <Input
                      value={award.location || ''}
                      onChange={(ev) => {
                        const arr = [...zAwards]
                        arr[i] = { ...arr[i], location: ev.target.value }
                        setZAwards(arr)
                      }}
                    />
                  </Td>
                  <Td>
                    <Textarea
                      value={(award.description || []).join('\n')}
                      onChange={(ev) => {
                        const arr = [...zAwards]
                        arr[i] = {
                          ...arr[i],
                          description: ev.target.value.split('\n'),
                        }
                        setZAwards(arr)
                      }}
                    />
                  </Td>
                  <Td>
                    <IconButton
                      aria-label="delete"
                      icon={<DeleteIcon />}
                      onClick={() =>
                        setZAwards(zAwards.filter((_, index) => index !== i))
                      }
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Button
            leftIcon={<AddIcon />}
            size="sm"
            mt={2}
            onClick={() =>
              setZAwards([
                ...zAwards,
                {
                  contestName: '',
                  award: '',
                  organization: '',
                  date: '',
                  location: '',
                  description: [],
                },
              ])
            }
          >
            添加奖项 (ZH)
          </Button>
        </>
      )}

      <Heading size="sm" mt={6} mb={2}>
        Certifications
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Organization</Th>
            <Th>URL</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {certs.map((c, i) => (
            <Tr key={i}>
              <Td>
                <Input
                  value={c.issuingOrganization}
                  onChange={(ev) => {
                    const arr = [...certs]
                    arr[i] = { ...arr[i], issuingOrganization: ev.target.value }
                    setCerts(arr)
                  }}
                />
              </Td>
              <Td>
                <Input
                  value={c.organizationURL}
                  onChange={(ev) => {
                    const arr = [...certs]
                    arr[i] = { ...arr[i], organizationURL: ev.target.value }
                    setCerts(arr)
                  }}
                />
              </Td>
              <Td>
                <IconButton
                  aria-label="delete"
                  icon={<DeleteIcon />}
                  onClick={() => setCerts(certs.filter((_, x) => x !== i))}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button
        leftIcon={<AddIcon />}
        size="sm"
        mt={2}
        onClick={() =>
          setCerts([
            ...certs,
            {
              issuingOrganization: '',
              organizationURL: '',
              CertificationList: [],
            },
          ])
        }
      >
        Add Organization
      </Button>

      <Heading size="xs" mt={3} mb={1}>
        Certificates of Organization
      </Heading>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Org Idx</Th>
            <Th>Name</Th>
            <Th>Issued</Th>
            <Th>Expire</Th>
            <Th>Credential ID</Th>
            <Th>URL</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {certs.flatMap((c, ci) =>
            c.CertificationList.map((l, li) => (
              <Tr key={`${ci}-${li}`}>
                <Td>{ci + 1}</Td>
                <Td>
                  <Input
                    value={l.certificationName}
                    onChange={(ev) => {
                      const arr = [...certs]
                      arr[ci].CertificationList[li].certificationName =
                        ev.target.value
                      setCerts(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={l.issuedDate}
                    onChange={(ev) => {
                      const arr = [...certs]
                      arr[ci].CertificationList[li].issuedDate = ev.target.value
                      setCerts(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={l.expirationDate}
                    onChange={(ev) => {
                      const arr = [...certs]
                      arr[ci].CertificationList[li].expirationDate =
                        ev.target.value
                      setCerts(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={l.credentialID}
                    onChange={(ev) => {
                      const arr = [...certs]
                      arr[ci].CertificationList[li].credentialID =
                        ev.target.value
                      setCerts(arr)
                    }}
                  />
                </Td>
                <Td>
                  <Input
                    value={l.credentialURL}
                    onChange={(ev) => {
                      const arr = [...certs]
                      arr[ci].CertificationList[li].credentialURL =
                        ev.target.value
                      setCerts(arr)
                    }}
                  />
                </Td>
                <Td>
                  <IconButton
                    aria-label="delete"
                    icon={<DeleteIcon />}
                    onClick={() => {
                      const arr = [...certs]
                      arr[ci].CertificationList = arr[
                        ci
                      ].CertificationList.filter((_, x) => x !== li)
                      setCerts(arr)
                    }}
                  />
                </Td>
              </Tr>
            ))
          )}
        </Tbody>
      </Table>
      <HStack mt={2}>
        <Input
          placeholder="Org index (1-based)"
          width="220px"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const idx = Number((e.target as HTMLInputElement).value) - 1
              if (idx >= 0 && idx < certs.length) {
                const arr = [...certs]
                arr[idx].CertificationList.push({
                  certificationName: '',
                  issuedDate: '',
                  expirationDate: '',
                  credentialID: '',
                  credentialURL: '',
                })
                setCerts(arr)
              }
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
        <Button
          size="sm"
          onClick={() => {
            if (certs.length === 0) {
              toast({ status: 'error', title: 'Add an organization first' })
              return
            }
            const arr = [...certs]
            arr[certs.length - 1].CertificationList.push({
              certificationName: '',
              issuedDate: '',
              expirationDate: '',
              credentialID: '',
              credentialURL: '',
            })
            setCerts(arr)
          }}
        >
          Add Certificate (last)
        </Button>
      </HStack>

      <HStack mt={6}>
        <Button colorScheme="blue" onClick={() => save(false, bilingual)}>
          Save EN{bilingual ? ' + ZH' : ''}
        </Button>
        <Button onClick={() => save(true, bilingual)}>
          Save EN + Sync ZH{bilingual ? ' (include ZH)' : ''}
        </Button>
      </HStack>
    </>
  )
}
