/**
 * VersionHistory – premium admin component
 * Shows file-based snapshots for CV and Home data with preview + restore controls.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Textarea,
  useColorModeValue,
  useDisclosure,
  useToast,
  VStack,
  Badge,
  Tooltip,
  Spinner,
} from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaHistory, FaUndo, FaEye, FaCamera, FaDownload, FaCodeBranch } from 'react-icons/fa'

type VersionEntry = {
  filename: string
  date: string
  label: string
  index: number
  isLatest: boolean
  type: string
}

const GRADIENT_CV = 'linear-gradient(135deg,#dd6b20,#f59e0b)'
const GRADIENT_HOME = 'linear-gradient(135deg,#0f766e,#14b8a6)'

const VersionRow = ({
  v,
  onPreview,
  onRestore,
  onDownload,
}: {
  v: VersionEntry
  onPreview: (v: VersionEntry) => void
  onRestore: (v: VersionEntry) => void
  onDownload: (v: VersionEntry) => void
}) => {
  const cardBg = useColorModeValue('rgba(255,255,255,0.7)', 'rgba(30,41,59,0.6)')
  const border = useColorModeValue('rgba(0,0,0,0.07)', 'rgba(255,255,255,0.1)')
  const dim = useColorModeValue('gray.500', 'gray.400')
  const gradient = v.type === 'home' ? GRADIENT_HOME : GRADIENT_CV

  const formattedDate = v.date
    ? new Date(v.date).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : v.filename

  return (
    <Box
      as={motion.div as any}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      bg={cardBg}
      border="1px solid"
      borderColor={border}
      borderRadius="14px"
      px={4}
      py={3}
      backdropFilter="blur(8px)"
      position="relative"
      overflow="hidden"
    >
      <Box position="absolute" left={0} top={0} bottom={0} w="3px" bgImage={gradient} />
      <Flex align="center" justify="space-between" gap={2}>
        <Flex align="center" gap={3} flex={1} minW={0}>
          <Box
            p={2}
            borderRadius="8px"
            bgImage={gradient}
            color="white"
            flexShrink={0}
            display="flex"
            alignItems="center"
          >
            <FaCodeBranch size={12} />
          </Box>
          <Box minW={0}>
            <Flex align="center" gap={2}>
              <Text fontSize="sm" fontWeight="700" noOfLines={1}>
                {formattedDate}
              </Text>
              {v.isLatest && (
                <Badge
                  colorScheme={v.type === 'home' ? 'teal' : 'orange'}
                  variant="subtle"
                  borderRadius="full"
                  px={2}
                  fontSize="10px"
                >
                  Latest
                </Badge>
              )}
            </Flex>
            <Text fontSize="xs" color={dim} noOfLines={1}>
              {v.filename}
            </Text>
          </Box>
        </Flex>
        <HStack spacing={1}>
          <Tooltip label="Preview">
            <IconButton
              size="sm"
              variant="ghost"
              icon={<FaEye />}
              aria-label="Preview"
              onClick={() => onPreview(v)}
            />
          </Tooltip>
          <Tooltip label="Download">
            <IconButton
              size="sm"
              variant="ghost"
              icon={<FaDownload />}
              aria-label="Download"
              onClick={() => onDownload(v)}
            />
          </Tooltip>
          <Tooltip label="Restore this version">
            <IconButton
              size="sm"
              colorScheme={v.type === 'home' ? 'teal' : 'orange'}
              variant="ghost"
              icon={<FaUndo />}
              aria-label="Restore"
              onClick={() => onRestore(v)}
            />
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  )
}

export default function VersionHistory() {
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [dataType, setDataType] = useState<'cv' | 'home'>('cv')
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)
  const [previewVersion, setPreviewVersion] = useState<VersionEntry | null>(null)
  const [previewData, setPreviewData] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<VersionEntry | null>(null)
  const { isOpen: isRestoreOpen, onOpen: onRestoreOpen, onClose: onRestoreClose } = useDisclosure()

  const panelBg = useColorModeValue('rgba(255,255,255,0.9)', 'rgba(22,28,36,0.85)')
  const border = useColorModeValue('rgba(0,0,0,0.07)', 'rgba(255,255,255,0.1)')
  const dim = useColorModeValue('gray.600', 'gray.400')

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/versions?type=${dataType}`)
      const data = await res.json()
      if (data.ok) setVersions(data.versions || [])
    } catch {
      toast({ status: 'error', title: 'Failed to load versions' })
    } finally {
      setLoading(false)
    }
  }, [dataType, toast])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const takeSnapshot = async () => {
    setSnapshotting(true)
    try {
      const res = await fetch(`/api/versions?type=${dataType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snapshot' }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ status: 'success', title: `Snapshot saved: ${data.file}` })
        fetchVersions()
      } else {
        throw new Error(data.error)
      }
    } catch (e: any) {
      toast({ status: 'error', title: 'Snapshot failed', description: e.message })
    } finally {
      setSnapshotting(false)
    }
  }

  const handlePreview = async (v: VersionEntry) => {
    setPreviewVersion(v)
    setPreviewData('')
    setPreviewLoading(true)
    onOpen()
    try {
      const res = await fetch(`/api/versions?type=${v.type}&file=${encodeURIComponent(v.filename)}&preview=1`)
      const data = await res.json()
      if (data.ok) setPreviewData(JSON.stringify(data.data, null, 2))
    } catch {
      setPreviewData('Failed to load preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDownload = (v: VersionEntry) => {
    const url = `/api/${v.type === 'home' ? 'home' : 'cvdata'}?download=1&file=${encodeURIComponent(v.filename)}`
    window.open(url, '_blank')
  }

  const handleRestoreClick = (v: VersionEntry) => {
    setRestoreTarget(v)
    onRestoreOpen()
  }

  const confirmRestore = async () => {
    if (!restoreTarget) return
    try {
      const res = await fetch(`/api/versions?type=${restoreTarget.type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', filename: restoreTarget.filename }),
      })
      const data = await res.json()
      if (data.ok) {
        toast({ status: 'success', title: 'Restored successfully', description: `Rolled back to ${restoreTarget.filename}` })
        onRestoreClose()
        fetchVersions()
      } else {
        throw new Error(data.error)
      }
    } catch (e: any) {
      toast({ status: 'error', title: 'Restore failed', description: e.message })
    }
  }

  const gradient = dataType === 'home' ? GRADIENT_HOME : GRADIENT_CV

  return (
    <Box
      bg={panelBg}
      border="1px solid"
      borderColor={border}
      borderRadius="20px"
      backdropFilter="blur(14px)"
      p={{ base: 5, md: 7 }}
    >
      {/* Header */}
      <Flex align="center" justify="space-between" mb={6} flexWrap="wrap" gap={3}>
        <Flex align="center" gap={3}>
          <Box p={2} borderRadius="10px" bgImage={gradient} color="white" display="flex" alignItems="center">
            <FaHistory size={16} />
          </Box>
          <Box>
            <Heading size="md" fontFamily="'Sora', sans-serif">
              Version History
            </Heading>
            <Text fontSize="xs" color={dim}>
              File-based snapshots — auto-saved on every edit
            </Text>
          </Box>
        </Flex>

        <HStack spacing={3}>
          <Select
            size="sm"
            value={dataType}
            onChange={(e) => setDataType(e.target.value as 'cv' | 'home')}
            w="140px"
            borderRadius="10px"
          >
            <option value="cv">CV Data</option>
            <option value="home">Home Data</option>
          </Select>
          <Button
            size="sm"
            leftIcon={<FaCamera />}
            colorScheme={dataType === 'home' ? 'teal' : 'orange'}
            borderRadius="10px"
            isLoading={snapshotting}
            onClick={takeSnapshot}
          >
            Snapshot Now
          </Button>
        </HStack>
      </Flex>

      {/* Versions list */}
      {loading ? (
        <Flex justify="center" py={10}>
          <Spinner size="lg" color={dataType === 'home' ? 'teal.400' : 'orange.400'} />
        </Flex>
      ) : versions.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          py={12}
          border="2px dashed"
          borderColor={border}
          borderRadius="16px"
          gap={3}
        >
          <FaHistory size={32} opacity={0.3} />
          <Text color={dim} fontSize="sm">
            No snapshots yet. Click &ldquo;Snapshot Now&rdquo; or edit data to auto-create one.
          </Text>
        </Flex>
      ) : (
        <VStack spacing={2} align="stretch">
          <AnimatePresence>
            {versions.map((v) => (
              <VersionRow
                key={v.filename}
                v={v}
                onPreview={handlePreview}
                onRestore={handleRestoreClick}
                onDownload={handleDownload}
              />
            ))}
          </AnimatePresence>
        </VStack>
      )}

      {/* Preview Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
        <ModalOverlay backdropFilter="blur(8px)" />
        <ModalContent borderRadius="20px">
          <ModalHeader>
            <Flex align="center" gap={2}>
              <FaEye />
              <Text>Preview: {previewVersion?.filename}</Text>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {previewLoading ? (
              <Flex justify="center" py={8}><Spinner /></Flex>
            ) : (
              <Textarea
                value={previewData}
                readOnly
                rows={30}
                fontFamily="monospace"
                fontSize="xs"
                resize="vertical"
              />
            )}
          </ModalBody>
          <ModalFooter>
            <HStack>
              {previewVersion && (
                <Button
                  colorScheme={previewVersion.type === 'home' ? 'teal' : 'orange'}
                  leftIcon={<FaUndo />}
                  onClick={() => {
                    onClose()
                    handleRestoreClick(previewVersion)
                  }}
                >
                  Restore This Version
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Restore Confirm Modal */}
      <Modal isOpen={isRestoreOpen} onClose={onRestoreClose} size="md">
        <ModalOverlay backdropFilter="blur(8px)" />
        <ModalContent borderRadius="20px">
          <ModalHeader>
            <Flex align="center" gap={2}>
              <FaUndo />
              <Text>Confirm Restore</Text>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="start" spacing={3}>
              <Text>
                Are you sure you want to restore{' '}
                <strong>{restoreTarget?.type === 'home' ? 'Home' : 'CV'} data</strong> to this version?
              </Text>
              <Box
                p={3}
                bg="orange.50"
                borderRadius="12px"
                border="1px solid"
                borderColor="orange.200"
                w="100%"
              >
                <Text fontSize="sm" color="orange.700" fontFamily="monospace">
                  {restoreTarget?.filename}
                </Text>
              </Box>
              <Text fontSize="sm" color="gray.500">
                ⚠️ The current live data will be overwritten. A snapshot of the current state will be saved automatically before restoring.
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button
                colorScheme="orange"
                leftIcon={<FaUndo />}
                onClick={confirmRestore}
              >
                Restore
              </Button>
              <Button variant="ghost" onClick={onRestoreClose}>Cancel</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}
