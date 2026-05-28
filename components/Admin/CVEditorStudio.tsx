import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Divider,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Kbd,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Switch,
  Text,
  Textarea,
  Tooltip,
  useColorModeValue,
  useDisclosure,
  useToast,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react'
import {
  AddIcon,
  ChevronDownIcon,
  DeleteIcon,
  SearchIcon,
  ViewIcon,
  ViewOffIcon,
} from '@chakra-ui/icons'
import {
  FaUndo,
  FaRedo,
  FaSave,
  FaGripVertical,
  FaFileExport,
  FaFileImport,
  FaPrint,
  FaCircle,
} from 'react-icons/fa'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CVResult from '../CVViewerPage/CVResult'

/* ─────────────────────────────────────────────────────────────────────────
 * CV Editor Studio (v6) — industry-grade workspace.
 *
 * Layout:                                                                      ┌──────────────────────────────────────────────────────────────────────┐
 * │ Toolbar [Save] [Undo] [Redo] [Lang] [Import] [Export PDF] [Status pill] │
 * ├───────────┬────────────────────────────────┬─────────────────────────────┤
 * │ Sidebar   │  Editor form for selection      │  Live A4 preview            │
 * │ (sections │  - inline fields, autovalidate  │  (real CVResult render)     │
 * │  list,    │  - per-item add/remove          │  - language follows toolbar │
 * │  search,  │                                 │  - scroll-locked            │
 * │  reorder, │                                 │                             │
 * │  show/hide│                                 │                             │
 * │  new)     │                                 │                             │
 * └───────────┴────────────────────────────────┴─────────────────────────────┘
 *
 * Features:
 *   - Undo / Redo (50-level history, ⌘Z / ⌘⇧Z)
 *   - Save (⌘S) — POST /api/cvdata, snapshots automatically on the server
 *   - Auto-save to localStorage every 3s while dirty (recovers on page reload)
 *   - Drag-drop reorder via @dnd-kit (also keyboard accessible)
 *   - Per-section visibility toggle + delete with confirmation
 *   - Add-section menu with all 8 known templates
 *   - Section search filter
 *   - Live preview pane reflects every keystroke (debounced 200ms for perf)
 *   - Export current state as JSON file; import JSON file to replace
 *   - Print / Save-as-PDF via window.print() (CV CSS already handles A4)
 *   - Language switch between EN and ZH; 'Sync ZH from EN structure' button
 *
 * The shape of cvdata is unchanged ({ en: [], zh: [] } with the same section
 * keys), so /cv viewer, snapshots, and MongoDB backup continue to work.
 * ──────────────────────────────────────────────────────────────────────── */

const monoFont = 'var(--font-geist-mono), monospace'

// ── Section catalog ───────────────────────────────────────────────────────
const SECTION_DEFS: Record<
  string,
  { label: string; emoji: string; template: any }
> = {
  personalInformation: {
    label: 'Personal Info',
    emoji: '·',
    template: {
      sessionName: 'personalInformation',
      headerName: 'Personal Information',
      firstName: '',
      lastName: '',
      nickName: '',
      email: '',
      phoneNumber: '',
      personalWebsite: '',
      address: '',
      introduction: '',
      hiddenFields: [],
      separatorColor: '#030303',
      isVisible: true,
    },
  },
  education: {
    label: 'Education',
    emoji: '·',
    template: {
      sessionName: 'education',
      headerName: 'EDUCATION EXPERIENCE',
      educationExperience: [],
      isVisible: true,
    },
  },
  skill: {
    label: 'Skills',
    emoji: '·',
    template: {
      sessionName: 'skill',
      headerName: 'PROGRAMMING LANGUAGES & TECHNICAL SKILLS',
      languages: [],
      technical: [],
      isVisible: true,
    },
  },
  project: {
    label: 'Projects',
    emoji: '·',
    template: {
      sessionName: 'project',
      headerName: 'PROJECT EXPERIENCE',
      projectExperience: [],
      isVisible: true,
    },
  },
  workExperience: {
    label: 'Work Experience',
    emoji: '·',
    template: {
      sessionName: 'workExperience',
      headerName: 'WORK EXPERIENCE',
      experiences: [],
      isVisible: true,
    },
  },
  competitionAwards: {
    label: 'Awards',
    emoji: '·',
    template: {
      sessionName: 'competitionAwards',
      headerName: 'COMPETITION AWARDS',
      competitionAwardsList: [],
      isVisible: true,
    },
  },
  extraSkill: {
    label: 'Extra Skills',
    emoji: '·',
    template: {
      sessionName: 'extraSkill',
      headerName: 'EXTRA SKILLS',
      extraSkills: [],
      isVisible: true,
    },
  },
  certification: {
    label: 'Certifications',
    emoji: '·',
    template: {
      sessionName: 'certification',
      headerName: 'CERTIFICATIONS',
      certifications: [],
      isVisible: true,
    },
  },
}

// ── Types ─────────────────────────────────────────────────────────────────
type CVSection = { sessionName: string; isVisible?: boolean; [k: string]: any }

// ── Helpers ───────────────────────────────────────────────────────────────
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function timeAgo(ms: number) {
  if (!ms) return 'never'
  const d = Math.max(0, Date.now() - ms)
  const s = Math.floor(d / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ── Sortable sidebar item ─────────────────────────────────────────────────
function SortableSidebarItem({
  section,
  active,
  onClick,
  onToggleVisible,
  onDelete,
}: {
  section: CVSection
  active: boolean
  onClick: () => void
  onToggleVisible: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.sessionName })

  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const activeBg = useColorModeValue('rgba(99,102,241,0.10)', 'rgba(99,102,241,0.16)')
  const dim = useColorModeValue('gray.600', 'gray.500')
  const def = SECTION_DEFS[section.sessionName]

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Flex
      ref={setNodeRef}
      style={style}
      align="center"
      gap={2}
      px={2}
      py={2}
      borderRadius="md"
      borderWidth="1px"
      borderColor={active ? 'var(--accent)' : 'transparent'}
      bg={active ? activeBg : 'transparent'}
      _hover={{ borderColor: active ? 'var(--accent)' : border }}
      cursor="pointer"
      onClick={onClick}
    >
      <Box
        {...attributes}
        {...listeners}
        cursor="grab"
        color={dim}
        _active={{ cursor: 'grabbing' }}
        p={1}
        aria-label="Drag to reorder"
      >
        <FaGripVertical size={10} />
      </Box>
      <Box flex={1} minW={0}>
        <Text fontSize="13px" fontWeight={500} noOfLines={1}>
          {def?.label || section.sessionName}
        </Text>
        <Text fontFamily={monoFont} fontSize="10px" color={dim} noOfLines={1}>
          {section.sessionName}
        </Text>
      </Box>
      <IconButton
        aria-label={section.isVisible !== false ? 'Hide section' : 'Show section'}
        icon={section.isVisible !== false ? <ViewIcon /> : <ViewOffIcon />}
        size="xs"
        variant="ghost"
        color={section.isVisible !== false ? dim : 'orange.400'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleVisible()
        }}
      />
      <IconButton
        aria-label="Delete section"
        icon={<DeleteIcon />}
        size="xs"
        variant="ghost"
        colorScheme="red"
        onClick={(e) => {
          e.stopPropagation()
          if (confirm(`Delete section "${def?.label || section.sessionName}"?`)) onDelete()
        }}
      />
    </Flex>
  )
}

// ── Form: generic field-array helpers ─────────────────────────────────────
function FieldRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const dim = useColorModeValue('gray.600', 'gray.500')
  return (
    <Box>
      <Text
        fontFamily={monoFont}
        fontSize="10px"
        letterSpacing="0.08em"
        textTransform="uppercase"
        color={dim}
        mb={1.5}
      >
        {label}
      </Text>
      {children}
    </Box>
  )
}

function ArrayItemFrame({
  index,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  children,
}: {
  index: number
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
  children: React.ReactNode
}) {
  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const dim = useColorModeValue('gray.600', 'gray.500')
  return (
    <Box
      border="1px solid"
      borderColor={border}
      borderRadius="md"
      p={3}
      position="relative"
    >
      <Flex
        justify="space-between"
        align="center"
        mb={3}
        pb={2}
        borderBottom="1px solid"
        borderColor={border}
      >
        <Text fontFamily={monoFont} fontSize="10px" color={dim} letterSpacing="0.08em">
          #{index + 1}
        </Text>
        <HStack spacing={1}>
          <IconButton
            aria-label="Move up"
            icon={<Text fontFamily={monoFont}>↑</Text>}
            size="xs"
            variant="ghost"
            isDisabled={isFirst}
            onClick={onMoveUp}
          />
          <IconButton
            aria-label="Move down"
            icon={<Text fontFamily={monoFont}>↓</Text>}
            size="xs"
            variant="ghost"
            isDisabled={isLast}
            onClick={onMoveDown}
          />
          <IconButton
            aria-label="Remove"
            icon={<DeleteIcon />}
            size="xs"
            variant="ghost"
            colorScheme="red"
            onClick={() => {
              if (confirm(`Remove item #${index + 1}?`)) onRemove()
            }}
          />
        </HStack>
      </Flex>
      <VStack align="stretch" spacing={3}>
        {children}
      </VStack>
    </Box>
  )
}

// ── Section forms ─────────────────────────────────────────────────────────
function SectionForm({
  section,
  onChange,
}: {
  section: CVSection
  onChange: (next: CVSection) => void
}) {
  const set = (patch: Partial<CVSection>) => onChange({ ...section, ...patch })
  const setItem = (key: string, idx: number, patch: any) => {
    const list = [...(section[key] || [])]
    list[idx] = { ...list[idx], ...patch }
    set({ [key]: list })
  }
  const addItem = (key: string, blank: any) => {
    const list = [...(section[key] || []), blank]
    set({ [key]: list })
  }
  const removeItem = (key: string, idx: number) => {
    const list = [...(section[key] || [])]
    list.splice(idx, 1)
    set({ [key]: list })
  }
  const moveItem = (key: string, from: number, to: number) => {
    const list = [...(section[key] || [])]
    if (to < 0 || to >= list.length) return
    const [m] = list.splice(from, 1)
    list.splice(to, 0, m)
    set({ [key]: list })
  }

  const headerName = (
    <FieldRow label="Section heading">
      <Input
        size="sm"
        value={section.headerName || ''}
        onChange={(e) => set({ headerName: e.target.value })}
      />
    </FieldRow>
  )

  switch (section.sessionName) {
    case 'personalInformation': {
      const fields: Array<[string, string]> = [
        ['firstName', 'First name'],
        ['lastName', 'Last name'],
        ['nickName', 'Nick / preferred name'],
        ['email', 'Email'],
        ['phoneNumber', 'Phone'],
        ['personalWebsite', 'Personal website'],
        ['address', 'Address'],
      ]
      const hidden: string[] = section.hiddenFields || []
      const toggleHidden = (k: string) =>
        set({
          hiddenFields: hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k],
        })
      return (
        <VStack align="stretch" spacing={4}>
          {headerName}
          {fields.map(([k, label]) => (
            <FieldRow key={k} label={label}>
              <Flex gap={2} align="center">
                <Input
                  size="sm"
                  value={section[k] || ''}
                  onChange={(e) => set({ [k]: e.target.value })}
                  flex={1}
                />
                <Tooltip
                  label={hidden.includes(k) ? 'Hidden on CV' : 'Visible on CV'}
                  hasArrow
                >
                  <IconButton
                    aria-label="Toggle visibility on CV"
                    icon={hidden.includes(k) ? <ViewOffIcon /> : <ViewIcon />}
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleHidden(k)}
                  />
                </Tooltip>
              </Flex>
            </FieldRow>
          ))}
          <FieldRow label="Introduction">
            <Textarea
              size="sm"
              minH="120px"
              value={section.introduction || ''}
              onChange={(e) => set({ introduction: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="Separator color">
            <Input
              type="color"
              size="sm"
              value={section.separatorColor || '#030303'}
              onChange={(e) => set({ separatorColor: e.target.value })}
              w="80px"
            />
          </FieldRow>
        </VStack>
      )
    }

    case 'education': {
      const list = section.educationExperience || []
      return (
        <VStack align="stretch" spacing={4}>
          {headerName}
          <VStack align="stretch" spacing={3}>
            {list.map((it: any, idx: number) => (
              <ArrayItemFrame
                key={idx}
                index={idx}
                isFirst={idx === 0}
                isLast={idx === list.length - 1}
                onMoveUp={() => moveItem('educationExperience', idx, idx - 1)}
                onMoveDown={() => moveItem('educationExperience', idx, idx + 1)}
                onRemove={() => removeItem('educationExperience', idx)}
              >
                <FieldRow label="School">
                  <Input
                    size="sm"
                    value={it.schoolName || ''}
                    onChange={(e) =>
                      setItem('educationExperience', idx, { schoolName: e.target.value })
                    }
                  />
                </FieldRow>
                <Flex gap={3}>
                  <FieldRow label="Location">
                    <Input
                      size="sm"
                      value={it.schoolLocation || ''}
                      onChange={(e) =>
                        setItem('educationExperience', idx, { schoolLocation: e.target.value })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="GPA">
                    <Input
                      size="sm"
                      value={it.gpa || ''}
                      onChange={(e) =>
                        setItem('educationExperience', idx, { gpa: e.target.value })
                      }
                    />
                  </FieldRow>
                </Flex>
                <FieldRow label="Degree">
                  <Input
                    size="sm"
                    value={it.degree || ''}
                    onChange={(e) =>
                      setItem('educationExperience', idx, { degree: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Major">
                  <Input
                    size="sm"
                    value={it.major || ''}
                    onChange={(e) =>
                      setItem('educationExperience', idx, { major: e.target.value })
                    }
                  />
                </FieldRow>
                <Flex gap={3}>
                  <FieldRow label="Start date">
                    <Input
                      size="sm"
                      type="date"
                      value={(it.startDate || '').slice(0, 10)}
                      onChange={(e) =>
                        setItem('educationExperience', idx, { startDate: e.target.value })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="End date">
                    <Input
                      size="sm"
                      type="date"
                      value={(it.endDate || '').slice(0, 10)}
                      onChange={(e) =>
                        setItem('educationExperience', idx, { endDate: e.target.value })
                      }
                    />
                  </FieldRow>
                </Flex>
              </ArrayItemFrame>
            ))}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<AddIcon />}
              onClick={() =>
                addItem('educationExperience', {
                  schoolName: '',
                  schoolLocation: '',
                  degree: '',
                  major: '',
                  startDate: '',
                  endDate: '',
                  gpa: '',
                })
              }
            >
              Add degree
            </Button>
          </VStack>
        </VStack>
      )
    }

    case 'skill': {
      const langs = section.languages || []
      const tech = section.technical || []
      return (
        <VStack align="stretch" spacing={5}>
          {headerName}
          <Box>
            <Text fontWeight={600} fontSize="13px" mb={2}>
              Languages / core
            </Text>
            <VStack align="stretch" spacing={3}>
              {langs.map((it: any, idx: number) => (
                <ArrayItemFrame
                  key={idx}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === langs.length - 1}
                  onMoveUp={() => moveItem('languages', idx, idx - 1)}
                  onMoveDown={() => moveItem('languages', idx, idx + 1)}
                  onRemove={() => removeItem('languages', idx)}
                >
                  <FieldRow label="Language">
                    <Input
                      size="sm"
                      value={it.language || ''}
                      onChange={(e) => setItem('languages', idx, { language: e.target.value })}
                    />
                  </FieldRow>
                  <FieldRow label="Level / blurb">
                    <Textarea
                      size="sm"
                      rows={2}
                      value={it.level || ''}
                      onChange={(e) => setItem('languages', idx, { level: e.target.value })}
                    />
                  </FieldRow>
                </ArrayItemFrame>
              ))}
              <Button
                size="sm"
                variant="outline"
                leftIcon={<AddIcon />}
                onClick={() => addItem('languages', { language: '', level: '' })}
              >
                Add language
              </Button>
            </VStack>
          </Box>
          <Box>
            <Text fontWeight={600} fontSize="13px" mb={2}>
              Technical clusters
            </Text>
            <VStack align="stretch" spacing={3}>
              {tech.map((it: any, idx: number) => (
                <ArrayItemFrame
                  key={idx}
                  index={idx}
                  isFirst={idx === 0}
                  isLast={idx === tech.length - 1}
                  onMoveUp={() => moveItem('technical', idx, idx - 1)}
                  onMoveDown={() => moveItem('technical', idx, idx + 1)}
                  onRemove={() => removeItem('technical', idx)}
                >
                  <FieldRow label="Cluster name">
                    <Input
                      size="sm"
                      value={it.name || ''}
                      onChange={(e) => setItem('technical', idx, { name: e.target.value })}
                    />
                  </FieldRow>
                  <FieldRow label="Bullets (one per line)">
                    <Textarea
                      size="sm"
                      rows={4}
                      value={(it.description || []).join('\n')}
                      onChange={(e) =>
                        setItem('technical', idx, {
                          description: e.target.value.split('\n').filter(Boolean),
                        })
                      }
                    />
                  </FieldRow>
                </ArrayItemFrame>
              ))}
              <Button
                size="sm"
                variant="outline"
                leftIcon={<AddIcon />}
                onClick={() => addItem('technical', { name: '', description: [] })}
              >
                Add cluster
              </Button>
            </VStack>
          </Box>
        </VStack>
      )
    }

    case 'workExperience': {
      const list = section.experiences || []
      return (
        <VStack align="stretch" spacing={4}>
          {headerName}
          <VStack align="stretch" spacing={3}>
            {list.map((it: any, idx: number) => (
              <ArrayItemFrame
                key={idx}
                index={idx}
                isFirst={idx === 0}
                isLast={idx === list.length - 1}
                onMoveUp={() => moveItem('experiences', idx, idx - 1)}
                onMoveDown={() => moveItem('experiences', idx, idx + 1)}
                onRemove={() => removeItem('experiences', idx)}
              >
                <Flex gap={3}>
                  <FieldRow label="Job title">
                    <Input
                      size="sm"
                      value={it.jobTitle || ''}
                      onChange={(e) =>
                        setItem('experiences', idx, { jobTitle: e.target.value })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Company">
                    <Input
                      size="sm"
                      value={it.companyName || ''}
                      onChange={(e) =>
                        setItem('experiences', idx, { companyName: e.target.value })
                      }
                    />
                  </FieldRow>
                </Flex>
                <FieldRow label="Location">
                  <Input
                    size="sm"
                    value={it.location || ''}
                    onChange={(e) =>
                      setItem('experiences', idx, { location: e.target.value })
                    }
                  />
                </FieldRow>
                <Flex gap={3}>
                  <FieldRow label="Start">
                    <Input
                      size="sm"
                      type="date"
                      value={(it.startDate || '').slice(0, 10)}
                      onChange={(e) =>
                        setItem('experiences', idx, { startDate: e.target.value })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="End">
                    <Input
                      size="sm"
                      type="date"
                      value={(it.endDate || '').slice(0, 10)}
                      onChange={(e) =>
                        setItem('experiences', idx, { endDate: e.target.value })
                      }
                    />
                  </FieldRow>
                </Flex>
                <FieldRow label="Job description">
                  <Textarea
                    size="sm"
                    minH="100px"
                    value={it.jobDescription || ''}
                    onChange={(e) =>
                      setItem('experiences', idx, { jobDescription: e.target.value })
                    }
                  />
                </FieldRow>
              </ArrayItemFrame>
            ))}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<AddIcon />}
              onClick={() =>
                addItem('experiences', {
                  jobTitle: '',
                  companyName: '',
                  location: '',
                  startDate: '',
                  endDate: '',
                  jobDescription: '',
                })
              }
            >
              Add job
            </Button>
          </VStack>
        </VStack>
      )
    }

    case 'project': {
      const list = section.projectExperience || []
      return (
        <VStack align="stretch" spacing={4}>
          {headerName}
          <VStack align="stretch" spacing={3}>
            {list.map((it: any, idx: number) => (
              <ArrayItemFrame
                key={idx}
                index={idx}
                isFirst={idx === 0}
                isLast={idx === list.length - 1}
                onMoveUp={() => moveItem('projectExperience', idx, idx - 1)}
                onMoveDown={() => moveItem('projectExperience', idx, idx + 1)}
                onRemove={() => removeItem('projectExperience', idx)}
              >
                <FieldRow label="Title">
                  <Input
                    size="sm"
                    value={it.title || ''}
                    onChange={(e) =>
                      setItem('projectExperience', idx, { title: e.target.value })
                    }
                  />
                </FieldRow>
                <Flex gap={3}>
                  <FieldRow label="Start">
                    <Input
                      size="sm"
                      type="month"
                      value={(it.startDate || '').slice(0, 7)}
                      onChange={(e) =>
                        setItem('projectExperience', idx, { startDate: e.target.value })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="End">
                    <Input
                      size="sm"
                      type="month"
                      value={(it.endDate || '').slice(0, 7)}
                      onChange={(e) =>
                        setItem('projectExperience', idx, { endDate: e.target.value })
                      }
                    />
                  </FieldRow>
                </Flex>
                <FieldRow label="Location">
                  <Input
                    size="sm"
                    value={it.projectLocation || ''}
                    onChange={(e) =>
                      setItem('projectExperience', idx, { projectLocation: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Description">
                  <Textarea
                    size="sm"
                    minH="80px"
                    value={it.description || ''}
                    onChange={(e) =>
                      setItem('projectExperience', idx, { description: e.target.value })
                    }
                  />
                </FieldRow>
              </ArrayItemFrame>
            ))}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<AddIcon />}
              onClick={() =>
                addItem('projectExperience', {
                  title: '',
                  startDate: '',
                  endDate: '',
                  projectLocation: '',
                  description: '',
                  features: [],
                })
              }
            >
              Add project
            </Button>
          </VStack>
        </VStack>
      )
    }

    case 'certification': {
      const orgs = section.certifications || []
      return (
        <VStack align="stretch" spacing={4}>
          {headerName}
          <VStack align="stretch" spacing={3}>
            {orgs.map((org: any, idx: number) => (
              <ArrayItemFrame
                key={idx}
                index={idx}
                isFirst={idx === 0}
                isLast={idx === orgs.length - 1}
                onMoveUp={() => moveItem('certifications', idx, idx - 1)}
                onMoveDown={() => moveItem('certifications', idx, idx + 1)}
                onRemove={() => removeItem('certifications', idx)}
              >
                <FieldRow label="Issuing organization">
                  <Input
                    size="sm"
                    value={org.issuingOrganization || ''}
                    onChange={(e) =>
                      setItem('certifications', idx, {
                        issuingOrganization: e.target.value,
                      })
                    }
                  />
                </FieldRow>
                <Box>
                  <Text
                    fontFamily={monoFont}
                    fontSize="10px"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    mb={2}
                  >
                    Certificates ({(org.CertificationList || []).length})
                  </Text>
                  <VStack align="stretch" spacing={2}>
                    {(org.CertificationList || []).map((c: any, ci: number) => (
                      <Flex key={ci} gap={2}>
                        <Input
                          size="sm"
                          placeholder="Name"
                          value={c.certificationName || ''}
                          onChange={(e) => {
                            const list = [...(org.CertificationList || [])]
                            list[ci] = { ...list[ci], certificationName: e.target.value }
                            setItem('certifications', idx, { CertificationList: list })
                          }}
                        />
                        <Input
                          size="sm"
                          placeholder="URL"
                          value={c.credentialURL || ''}
                          onChange={(e) => {
                            const list = [...(org.CertificationList || [])]
                            list[ci] = { ...list[ci], credentialURL: e.target.value }
                            setItem('certifications', idx, { CertificationList: list })
                          }}
                        />
                        <IconButton
                          aria-label="Remove cert"
                          icon={<DeleteIcon />}
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() => {
                            const list = [...(org.CertificationList || [])]
                            list.splice(ci, 1)
                            setItem('certifications', idx, { CertificationList: list })
                          }}
                        />
                      </Flex>
                    ))}
                    <Button
                      size="xs"
                      variant="ghost"
                      leftIcon={<AddIcon />}
                      onClick={() => {
                        const list = [
                          ...(org.CertificationList || []),
                          { certificationName: '', credentialURL: '' },
                        ]
                        setItem('certifications', idx, { CertificationList: list })
                      }}
                    >
                      Add certificate
                    </Button>
                  </VStack>
                </Box>
              </ArrayItemFrame>
            ))}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<AddIcon />}
              onClick={() =>
                addItem('certifications', {
                  issuingOrganization: '',
                  CertificationList: [],
                })
              }
            >
              Add organization
            </Button>
          </VStack>
        </VStack>
      )
    }

    case 'extraSkill': {
      const list = section.extraSkills || []
      return (
        <VStack align="stretch" spacing={4}>
          {headerName}
          <FieldRow label="Bullets (one per line)">
            <Textarea
              size="sm"
              minH="160px"
              value={list.join('\n')}
              onChange={(e) =>
                set({ extraSkills: e.target.value.split('\n') })
              }
            />
          </FieldRow>
        </VStack>
      )
    }

    case 'competitionAwards': {
      const list = section.competitionAwardsList || []
      return (
        <VStack align="stretch" spacing={4}>
          {headerName}
          <VStack align="stretch" spacing={3}>
            {list.map((it: any, idx: number) => (
              <ArrayItemFrame
                key={idx}
                index={idx}
                isFirst={idx === 0}
                isLast={idx === list.length - 1}
                onMoveUp={() => moveItem('competitionAwardsList', idx, idx - 1)}
                onMoveDown={() => moveItem('competitionAwardsList', idx, idx + 1)}
                onRemove={() => removeItem('competitionAwardsList', idx)}
              >
                <FieldRow label="Competition / award">
                  <Input
                    size="sm"
                    value={it.competitionName || ''}
                    onChange={(e) =>
                      setItem('competitionAwardsList', idx, {
                        competitionName: e.target.value,
                      })
                    }
                  />
                </FieldRow>
                <Flex gap={3}>
                  <FieldRow label="Result">
                    <Input
                      size="sm"
                      value={it.result || ''}
                      onChange={(e) =>
                        setItem('competitionAwardsList', idx, { result: e.target.value })
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Date">
                    <Input
                      size="sm"
                      type="date"
                      value={(it.date || '').slice(0, 10)}
                      onChange={(e) =>
                        setItem('competitionAwardsList', idx, { date: e.target.value })
                      }
                    />
                  </FieldRow>
                </Flex>
                <FieldRow label="Description">
                  <Textarea
                    size="sm"
                    rows={3}
                    value={it.description || ''}
                    onChange={(e) =>
                      setItem('competitionAwardsList', idx, { description: e.target.value })
                    }
                  />
                </FieldRow>
              </ArrayItemFrame>
            ))}
            <Button
              size="sm"
              variant="outline"
              leftIcon={<AddIcon />}
              onClick={() =>
                addItem('competitionAwardsList', {
                  competitionName: '',
                  result: '',
                  date: '',
                  description: '',
                })
              }
            >
              Add award
            </Button>
          </VStack>
        </VStack>
      )
    }

    default:
      return (
        <Box>
          <Text fontFamily={monoFont} fontSize="11px" color="orange.400">
            Unknown section type: {section.sessionName}
          </Text>
          <Textarea
            mt={2}
            value={JSON.stringify(section, null, 2)}
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value))
              } catch {
                /* ignore */
              }
            }}
            fontFamily={monoFont}
            fontSize="12px"
            minH="240px"
          />
        </Box>
      )
  }
}

// ── Main component ────────────────────────────────────────────────────────
export default function CVEditorStudio() {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Server state (kept to support 'revert to last loaded' in the future)
  const [, setServerEn] = useState<CVSection[] | null>(null)
  const [, setServerZh] = useState<CVSection[] | null>(null)

  // Working state (what's being edited)
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const [data, setData] = useState<CVSection[]>([])
  const [otherLang, setOtherLang] = useState<CVSection[]>([]) // the inactive lang, edited via 'Sync ZH'
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  // History (undo/redo)
  const historyRef = useRef<CVSection[][]>([])
  const historyIdxRef = useRef<number>(-1)
  const [, setHistoryTick] = useState(0)

  // Save / dirty state
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const initialLoadRef = useRef(true)

  const { isOpen: isAddOpen, onOpen: openAdd, onClose: closeAdd } = useDisclosure()

  // Tokens — all hooks must run before any conditional return
  const bg = useColorModeValue('rgba(255,255,255,0.6)', 'rgba(8,8,8,0.6)')
  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const dim = useColorModeValue('gray.600', 'gray.500')
  const previewSurface = useColorModeValue('gray.100', 'gray.900')
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch('/api/cvdata')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        const en: CVSection[] = Array.isArray(d.en) ? d.en : []
        const zh: CVSection[] = Array.isArray(d.zh) ? d.zh : []
        setServerEn(en)
        setServerZh(zh)
        setData(clone(en))
        setOtherLang(clone(zh))
        historyRef.current = [clone(en)]
        historyIdxRef.current = 0
        if (en.length > 0) setSelected(en[0].sessionName)
        setLoading(false)
        initialLoadRef.current = false
      })
      .catch(() => {
        toast({ status: 'error', title: 'Failed to load CV data' })
        setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore local draft if newer than server load
  useEffect(() => {
    if (initialLoadRef.current || !data.length) return
    try {
      const key = `cv_draft_${lang}`
      const raw = localStorage.getItem(key)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft?.savedAt && draft?.data && Array.isArray(draft.data)) {
        if (Date.now() - draft.savedAt < 1000 * 60 * 60 * 24 * 7) {
          // less than 7 days old — offer
          if (
            JSON.stringify(draft.data) !== JSON.stringify(data) &&
            confirm('A newer local draft exists. Load it?')
          ) {
            applyState(draft.data)
          }
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  // Autosave to localStorage every 3s while dirty
  useEffect(() => {
    if (!dirty) return
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          `cv_draft_${lang}`,
          JSON.stringify({ savedAt: Date.now(), data }),
        )
      } catch {}
    }, 3000)
    return () => clearTimeout(id)
  }, [data, dirty, lang])

  // Beforeunload warning when dirty
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  // ── History helpers ─────────────────────────────────────────────────────
  const applyState = (next: CVSection[]) => {
    const idx = historyIdxRef.current
    // Drop forward history
    historyRef.current = historyRef.current.slice(0, idx + 1)
    historyRef.current.push(clone(next))
    if (historyRef.current.length > 50) historyRef.current.shift()
    historyIdxRef.current = historyRef.current.length - 1
    setData(next)
    setDirty(true)
    setHistoryTick((x) => x + 1)
  }

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current -= 1
    setData(clone(historyRef.current[historyIdxRef.current]))
    setDirty(true)
    setHistoryTick((x) => x + 1)
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current += 1
    setData(clone(historyRef.current[historyIdxRef.current]))
    setDirty(true)
    setHistoryTick((x) => x + 1)
  }, [])

  const canUndo = historyIdxRef.current > 0
  const canRedo = historyIdxRef.current < historyRef.current.length - 1

  // ── Server actions ──────────────────────────────────────────────────────
  const save = useCallback(
    async (syncZh = false) => {
      if (saving) return
      setSaving(true)
      try {
        const payload = lang === 'en' ? { en: data, zh: otherLang, syncZh } : { en: otherLang, zh: data, syncZh: false }
        const res = await fetch('/api/cvdata', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d?.error || `Save failed (${res.status})`)
        }
        setDirty(false)
        setLastSaved(Date.now())
        if (syncZh) {
          // refresh otherLang from server
          const r2 = await fetch('/api/cvdata').then((r) => r.json())
          setOtherLang(Array.isArray(r2.zh) ? r2.zh : [])
        }
        try {
          localStorage.removeItem(`cv_draft_${lang}`)
        } catch {}
        toast({ status: 'success', title: syncZh ? 'Saved (ZH synced)' : 'Saved' })
      } catch (e: any) {
        toast({ status: 'error', title: e?.message || 'Save failed' })
      } finally {
        setSaving(false)
      }
    },
    [data, otherLang, lang, saving, toast],
  )

  // Keyboard shortcuts (⌘S, ⌘Z, ⌘⇧Z)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        save(false)
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [save, undo, redo])

  // ── Language switching ──────────────────────────────────────────────────
  const switchLang = (next: 'en' | 'zh') => {
    if (next === lang) return
    if (dirty && !confirm('You have unsaved changes. Switch language and discard local edits in this tab?')) {
      return
    }
    // Stash current to otherLang slot
    const newOther = clone(data)
    const newData = clone(otherLang)
    setOtherLang(newOther)
    setData(newData)
    setLang(next)
    setSelected(newData[0]?.sessionName || null)
    historyRef.current = [clone(newData)]
    historyIdxRef.current = 0
    setDirty(false)
    setHistoryTick((x) => x + 1)
  }

  // ── Section mutations ───────────────────────────────────────────────────
  const updateSection = (sessionName: string, next: CVSection) => {
    const newData = data.map((s) => (s.sessionName === sessionName ? next : s))
    applyState(newData)
  }

  const toggleVisible = (sessionName: string) => {
    const newData = data.map((s) =>
      s.sessionName === sessionName ? { ...s, isVisible: s.isVisible === false } : s,
    )
    applyState(newData)
  }

  const deleteSection = (sessionName: string) => {
    const newData = data.filter((s) => s.sessionName !== sessionName)
    applyState(newData)
    if (selected === sessionName) setSelected(newData[0]?.sessionName || null)
  }

  const addSection = (sessionName: string) => {
    if (data.some((s) => s.sessionName === sessionName)) {
      toast({
        status: 'warning',
        title: `Section "${sessionName}" already exists`,
      })
      closeAdd()
      return
    }
    const def = SECTION_DEFS[sessionName]
    if (!def) return
    const newData = [...data, clone(def.template)]
    applyState(newData)
    setSelected(sessionName)
    closeAdd()
  }

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const fromIdx = data.findIndex((s) => s.sessionName === e.active.id)
    const toIdx = data.findIndex((s) => s.sessionName === e.over!.id)
    if (fromIdx < 0 || toIdx < 0) return
    applyState(arrayMove(data, fromIdx, toIdx))
  }

  // ── Import / Export ─────────────────────────────────────────────────────
  const exportJSON = () => {
    const blob = new Blob(
      [JSON.stringify({ [lang]: data }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cv-${lang}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const j = JSON.parse(text)
      let next: CVSection[] | null = null
      if (Array.isArray(j)) next = j
      else if (Array.isArray(j[lang])) next = j[lang]
      else if (Array.isArray(j.en)) next = j.en
      if (!next) throw new Error('Unrecognized JSON shape')
      applyState(next)
      toast({ status: 'success', title: 'Imported. Save to persist.' })
    } catch (e: any) {
      toast({ status: 'error', title: e?.message || 'Invalid JSON' })
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return data
    return data.filter((s) => {
      const def = SECTION_DEFS[s.sessionName]
      return (
        s.sessionName.toLowerCase().includes(q) ||
        (def?.label || '').toLowerCase().includes(q) ||
        (s.headerName || '').toLowerCase().includes(q)
      )
    })
  }, [data, search])

  const selectedSection = data.find((s) => s.sessionName === selected) || null
  const availableToAdd = Object.keys(SECTION_DEFS).filter(
    (k) => !data.some((s) => s.sessionName === k),
  )

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Flex h="60vh" align="center" justify="center" direction="column" gap={3}>
        <Spinner size="lg" color="var(--accent)" />
        <Text fontFamily={monoFont} fontSize="11px" color={dim}>
          Loading CV data…
        </Text>
      </Flex>
    )
  }

  return (
    <Flex direction="column" h="calc(100vh - 200px)" minH="600px" gap={0}>
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <Flex
        align="center"
        gap={2}
        px={3}
        h="48px"
        borderTop="1px solid"
        borderBottom="1px solid"
        borderColor={border}
        flexWrap="wrap"
      >
        <ButtonGroup size="sm" isAttached variant="outline">
          <Button
            leftIcon={<FaSave />}
            onClick={() => save(false)}
            isLoading={saving}
            isDisabled={!dirty}
            bg={dirty ? 'var(--accent)' : undefined}
            color={dirty ? 'white' : undefined}
            borderColor={dirty ? 'var(--accent)' : border}
            _hover={dirty ? { opacity: 0.9 } : {}}
          >
            Save
          </Button>
          <Tooltip label="Save & mirror EN structure into ZH" hasArrow>
            <Button
              onClick={() => save(true)}
              isLoading={saving}
              isDisabled={lang !== 'en'}
              fontSize="11px"
              fontFamily={monoFont}
              px={2}
            >
              + sync ZH
            </Button>
          </Tooltip>
        </ButtonGroup>

        <ButtonGroup size="sm" isAttached variant="outline">
          <Tooltip label="Undo (⌘Z)" hasArrow>
            <IconButton
              aria-label="Undo"
              icon={<FaUndo />}
              onClick={undo}
              isDisabled={!canUndo}
            />
          </Tooltip>
          <Tooltip label="Redo (⌘⇧Z)" hasArrow>
            <IconButton
              aria-label="Redo"
              icon={<FaRedo />}
              onClick={redo}
              isDisabled={!canRedo}
            />
          </Tooltip>
        </ButtonGroup>

        <ButtonGroup size="sm" isAttached variant="outline" ml={1}>
          <Button
            onClick={() => switchLang('en')}
            bg={lang === 'en' ? 'var(--accent-soft)' : undefined}
            borderColor={lang === 'en' ? 'var(--accent)' : border}
            color={lang === 'en' ? 'var(--accent)' : undefined}
            fontFamily={monoFont}
          >
            EN
          </Button>
          <Button
            onClick={() => switchLang('zh')}
            bg={lang === 'zh' ? 'var(--accent-soft)' : undefined}
            borderColor={lang === 'zh' ? 'var(--accent)' : border}
            color={lang === 'zh' ? 'var(--accent)' : undefined}
            fontFamily={monoFont}
          >
            中
          </Button>
        </ButtonGroup>

        <ButtonGroup size="sm" isAttached variant="outline" ml={1}>
          <Tooltip label="Import JSON" hasArrow>
            <IconButton
              aria-label="Import"
              icon={<FaFileImport />}
              onClick={() => fileInputRef.current?.click()}
            />
          </Tooltip>
          <Tooltip label="Export current language as JSON" hasArrow>
            <IconButton
              aria-label="Export"
              icon={<FaFileExport />}
              onClick={exportJSON}
            />
          </Tooltip>
          <Tooltip label="Open the CV viewer / print page in a new tab" hasArrow>
            <IconButton
              aria-label="Print"
              icon={<FaPrint />}
              onClick={() => window.open('/cv', '_blank')}
            />
          </Tooltip>
        </ButtonGroup>

        <HStack ml={2}>
          <Text fontFamily={monoFont} fontSize="11px" color={dim}>
            preview
          </Text>
          <Switch
            size="sm"
            isChecked={showPreview}
            onChange={(e) => setShowPreview(e.target.checked)}
          />
        </HStack>

        <Box ml="auto">
          <HStack spacing={2} fontFamily={monoFont} fontSize="11px" color={dim}>
            {dirty ? (
              <HStack spacing={1}>
                <FaCircle color="#fb923c" size={8} />
                <Text>unsaved</Text>
              </HStack>
            ) : lastSaved ? (
              <HStack spacing={1}>
                <FaCircle color="#22c55e" size={8} />
                <Text>saved · {timeAgo(lastSaved)}</Text>
              </HStack>
            ) : (
              <Text>up to date</Text>
            )}
            <Text opacity={0.5}>·</Text>
            <Kbd fontSize="10px" bg="transparent" borderColor={border}>⌘S</Kbd>
            <Kbd fontSize="10px" bg="transparent" borderColor={border}>⌘Z</Kbd>
          </HStack>
        </Box>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImportFile(f)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />
      </Flex>

      {/* ── Workspace ────────────────────────────────────────────────── */}
      <Flex flex={1} minH={0} overflow="hidden">
        {/* Sidebar */}
        <Box
          w="260px"
          flexShrink={0}
          borderRight="1px solid"
          borderColor={border}
          bg={bg}
          display="flex"
          flexDirection="column"
        >
          <Box p={3} borderBottom="1px solid" borderColor={border}>
            <InputGroup size="sm">
              <InputLeftElement pointerEvents="none">
                <SearchIcon boxSize={3} color={dim} />
              </InputLeftElement>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sections…"
                borderColor={border}
              />
            </InputGroup>
            <Menu>
              <MenuButton
                as={Button}
                size="sm"
                w="100%"
                mt={2}
                variant="outline"
                borderColor={border}
                leftIcon={<AddIcon />}
                rightIcon={<ChevronDownIcon />}
                isDisabled={availableToAdd.length === 0}
              >
                Add section
              </MenuButton>
              <MenuList>
                {availableToAdd.length === 0 ? (
                  <MenuItem isDisabled>All known sections present</MenuItem>
                ) : (
                  availableToAdd.map((k) => (
                    <MenuItem key={k} onClick={() => addSection(k)}>
                      <Text fontSize="13px" mr={2}>
                        {SECTION_DEFS[k].label}
                      </Text>
                      <Text fontFamily={monoFont} fontSize="10px" color={dim}>
                        {k}
                      </Text>
                    </MenuItem>
                  ))
                )}
              </MenuList>
            </Menu>
          </Box>
          <Box flex={1} overflowY="auto" p={2}>
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={data.map((s) => s.sessionName)}
                strategy={verticalListSortingStrategy}
              >
                <VStack align="stretch" spacing={1}>
                  {filtered.map((s) => (
                    <SortableSidebarItem
                      key={s.sessionName}
                      section={s}
                      active={selected === s.sessionName}
                      onClick={() => setSelected(s.sessionName)}
                      onToggleVisible={() => toggleVisible(s.sessionName)}
                      onDelete={() => deleteSection(s.sessionName)}
                    />
                  ))}
                </VStack>
              </SortableContext>
            </DndContext>
          </Box>
          <Box
            px={3}
            py={2}
            borderTop="1px solid"
            borderColor={border}
            fontFamily={monoFont}
            fontSize="10px"
            color={dim}
          >
            {data.length} section{data.length === 1 ? '' : 's'} ·{' '}
            {data.filter((s) => s.isVisible !== false).length} visible
          </Box>
        </Box>

        {/* Editor + Preview */}
        <Flex flex={1} minW={0} direction="row">
          {/* Editor */}
          <Box
            flex={1}
            minW={0}
            overflowY="auto"
            px={5}
            py={4}
            borderRight={showPreview ? '1px solid' : undefined}
            borderColor={border}
          >
            {selectedSection ? (
              <Box maxW="640px">
                <Flex align="center" justify="space-between" mb={4} flexWrap="wrap" gap={2}>
                  <Box>
                    <Text fontFamily={monoFont} fontSize="10px" color={dim} letterSpacing="0.12em" textTransform="uppercase">
                      Editing · {SECTION_DEFS[selectedSection.sessionName]?.label || selectedSection.sessionName}
                    </Text>
                    <Text fontSize="18px" fontWeight={500} mt={1}>
                      {selectedSection.headerName || selectedSection.sessionName}
                    </Text>
                  </Box>
                  <Badge
                    fontFamily={monoFont}
                    fontSize="10px"
                    variant="outline"
                    colorScheme={selectedSection.isVisible !== false ? 'green' : 'orange'}
                  >
                    {selectedSection.isVisible !== false ? 'visible on CV' : 'hidden on CV'}
                  </Badge>
                </Flex>
                <Divider mb={5} borderColor={border} />
                <SectionForm
                  section={selectedSection}
                  onChange={(next) => updateSection(selectedSection.sessionName, next)}
                />
              </Box>
            ) : (
              <Flex h="100%" align="center" justify="center" direction="column" gap={2}>
                <Text fontFamily={monoFont} fontSize="11px" color={dim}>
                  Select a section in the sidebar, or
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<AddIcon />}
                  onClick={openAdd}
                >
                  add a section
                </Button>
              </Flex>
            )}
          </Box>

          {/* Live A4 preview */}
          {showPreview && (
            <Box flex={1} minW={0} overflow="auto" bg={previewSurface} p={4}>
              <Box
                bg="white"
                color="black"
                style={{
                  fontSize: '9px',
                  transform: 'scale(0.65)',
                  transformOrigin: 'top left',
                  width: '154%', // compensate for 0.65 scale → 21cm fits
                }}
              >
                <CVResult cvData={data as any} />
              </Box>
            </Box>
          )}
        </Flex>
      </Flex>

      <Modal isOpen={isAddOpen} onClose={closeAdd} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add section</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Wrap spacing={2}>
              {availableToAdd.map((k) => (
                <WrapItem key={k}>
                  <Button size="sm" onClick={() => addSection(k)}>
                    {SECTION_DEFS[k].label}
                  </Button>
                </WrapItem>
              ))}
            </Wrap>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={closeAdd}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  )
}
