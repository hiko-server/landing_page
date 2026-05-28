import React, { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  SimpleGrid,
  Text,
  useColorModeValue,
  useToast,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Badge,
  Alert,
  AlertIcon,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Tooltip,
  InputGroup,
  InputRightElement,
  IconButton
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { ArrowBackIcon, CheckCircleIcon, WarningIcon, LockIcon, ViewIcon, ViewOffIcon } from '@chakra-ui/icons'

// -----------------------------------------------------------------------------
// Helpers — 防呆 (fool-proofing) display utilities
// -----------------------------------------------------------------------------

/** Mask the password section of a mongodb[+srv]://user:pass@host URI. */
function maskMongoUri(uri: string): string {
    if (!uri) return ''
    return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:/?#]+:)([^@]+)(@)/i, (_m, a, _p, c) => `${a}••••••••${c}`)
}

// -----------------------------------------------------------------------------
// Database Configuration Page
// -----------------------------------------------------------------------------

export default function DbConfigPage() {
  const toast = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [dbConfig, setDbConfig] = useState({
    url: 'mongodb://localhost:27017',
    username: '',
    password: '',
    dbName: 'cv_database'
  })
  const [dbVerified, setDbVerified] = useState(false)
  // 'env' = loaded read-only from .env, 'file' = data/mongo_config.json,
  // 'default' = nothing configured yet.
  const [configSource, setConfigSource] = useState<'env' | 'file' | 'default'>('default')
  const [showUrl, setShowUrl] = useState(false)
  
  // Status
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null)

  // 防呆: typed-confirmation modal for destructive actions (restore overwrites
  // local files). pendingAction holds the operation to run once the user types
  // the confirmation word.
  const [confirmInput, setConfirmInput] = useState('')
  const [pendingAction, setPendingAction] = useState<null | {
      kind: 'restore'
      type: 'all' | 'cv' | 'home' | 'images' | 'content' | 'snapshots'
      word: string
  }>(null)

  const isEnv = configSource === 'env'

  // Load Config on Mount
  useEffect(() => {
     const loadConfig = async () => {
         try {
             // 1. Try server config
             const res = await fetch('/api/mongo')
             const data = await res.json()
             if (data.ok && data.config) {
                 setDbConfig(data.config)
                 setConfigSource(data.fromEnv ? 'env' : 'file')
             } else {
                 // 2. Local storage fallback (only when env hasn't claimed it)
                 const saved = localStorage.getItem('cv_mongo_config')
                 if (saved) {
                     try { setDbConfig(JSON.parse(saved)) } catch(e){}
                 }
                 setConfigSource('default')
             }
         } catch (e) {
             console.error('Failed to load DB config', e)
         }
     }
     loadConfig()
  }, [])

  // Auto-save to Local Storage (skip when env owns the config — we don't want
  // stale credentials lingering in the browser).
  useEffect(() => {
      if (isEnv) return
      const timer = setTimeout(() => {
        localStorage.setItem('cv_mongo_config', JSON.stringify(dbConfig))
      }, 500)
      return () => clearTimeout(timer)
  }, [dbConfig, isEnv])

  // Helper: Connection String
  const constructUrl = () => {
    // When env owns the config, the URL already contains credentials —
    // do not splice anything in from the disabled username/password fields.
    if (isEnv) return dbConfig.url.trim()
    let uri = dbConfig.url.trim()
    if (dbConfig.username) {
        uri = uri.replace('<db_username>', encodeURIComponent(dbConfig.username))
                 .replace('<username>', encodeURIComponent(dbConfig.username))
    }
    if (dbConfig.password) {
        uri = uri.replace('<db_password>', encodeURIComponent(dbConfig.password))
                 .replace('<password>', encodeURIComponent(dbConfig.password))
    }
    if (dbConfig.username && dbConfig.password && !uri.includes('@')) {
       if (uri.includes('://')) {
           const parts = uri.split('://')
           if (parts.length === 2) uri = `${parts[0]}://${encodeURIComponent(dbConfig.username)}:${encodeURIComponent(dbConfig.password)}@${parts[1]}`
       } else {
           uri = `mongodb://${encodeURIComponent(dbConfig.username)}:${encodeURIComponent(dbConfig.password)}@${uri}`
       }
    }
    return uri
  }
  
  const saveConfigToServer = async (cfg: any) => {
      // 防呆: never push config to the server when env owns it (the API
      // would reject this anyway, but skip the wasted round-trip).
      if (isEnv) return
      try {
          await fetch('/api/mongo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_config', config: cfg })
          })
      } catch (e) {
         console.error('Failed to auto-save config', e)
      }
  }

  // Actions
  const testConnection = async () => {
      // 防呆: refuse to fire if the URL field is empty or obviously bogus.
      const uriRaw = dbConfig.url.trim()
      if (!uriRaw || !/^mongodb(\+srv)?:\/\//i.test(uriRaw)) {
          toast({ status: 'warning', title: 'Invalid URL', description: 'Expected a mongodb:// or mongodb+srv:// connection string.' })
          return
      }
      if (!dbConfig.dbName.trim()) {
          toast({ status: 'warning', title: 'Missing database name' })
          return
      }
      setLoading(true)
      try {
          const uri = constructUrl()
          const res = await fetch('/api/mongo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'test', config: { ...dbConfig, url: uri } })
          })
          const data = await res.json()
          if (res.ok && data.ok) {
              setDbVerified(true)
              toast({ status: 'success', title: 'Connected!', description: 'Database is reachable.' })
              saveConfigToServer(dbConfig)
              setLoading(false)
              return
          }
          // Failure: server returns { ok: false, message, error, code, hint }
          setDbVerified(false)
          const description =
              [data.hint, data.error, data.code && `code: ${data.code}`]
                  .filter(Boolean)
                  .join('  ·  ') ||
              data.message ||
              `HTTP ${res.status}`
          toast({
              status: 'error',
              title: 'Connection Failed',
              description,
              duration: 9000,
              isClosable: true,
          })
      } catch (e: any) {
          setDbVerified(false)
          toast({ status: 'error', title: 'Connection Failed', description: e?.message || 'Network error' })
      } finally {
          setLoading(false)
      }
  }

  const performBackup = async (type: 'all' | 'cv' | 'home' | 'images' | 'content' | 'snapshots') => {
      if (!dbVerified) return toast({ status: 'warning', title: 'Not Connected' })
      if (!confirm(`Start backup for: ${type}? This may take a while.`)) return

      setLoading(true)
      setBackupStatus('Backing up...')
      try {
          const uri = constructUrl()
          const res = await fetch('/api/mongo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  action: 'backup', 
                  type,
                  config: { ...dbConfig, url: uri } 
              })
          })
          const result = await res.json()
          if (res.ok && result.ok) {
              toast({ status: 'success', title: 'Backup Complete', description: result.message })
              setBackupStatus(`Success: ${result.message}`)
          } else {
              throw new Error(result.message)
          }
      } catch (e: any) {
          toast({ status: 'error', title: 'Backup Failed', description: e.message })
          setBackupStatus('Failed')
      } finally {
          setLoading(false)
      }
  }

  // 防呆: gate restore behind a typed-confirmation modal.
  const requestRestore = (type: 'all' | 'cv' | 'home' | 'images' | 'content' | 'snapshots') => {
      if (!dbVerified) return toast({ status: 'warning', title: 'Not Connected' })
      const word = `RESTORE-${type.toUpperCase()}`
      setConfirmInput('')
      setPendingAction({ kind: 'restore', type, word })
  }

  const executeRestore = async (type: 'all' | 'cv' | 'home' | 'images' | 'content' | 'snapshots') => {
      setLoading(true)
      setRestoreStatus('Restoring...')
      try {
          const uri = constructUrl()
          const res = await fetch('/api/mongo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  action: 'restore', 
                  type,
                  config: { ...dbConfig, url: uri } 
              })
          })
          const result = await res.json()
          if (res.ok && result.ok) {
              toast({ status: 'success', title: 'Restore Complete', description: result.message })
              setRestoreStatus(`Success: ${result.message}`)
          } else {
              throw new Error(result.message)
          }
      } catch (e: any) {
          toast({ status: 'error', title: 'Restore Failed', description: e.message })
          setRestoreStatus('Failed')
      } finally {
          setLoading(false)
      }
  }

  const displayedUrl = useMemo(
      () => (showUrl ? dbConfig.url : maskMongoUri(dbConfig.url)),
      [dbConfig.url, showUrl]
  )

  const pageBg = useColorModeValue('gray.50', 'gray.900')
  const cardBg = useColorModeValue('rgba(255,255,255,0.9)', 'rgba(30,41,59,0.7)')
  const borderColor = useColorModeValue('rgba(0,0,0,0.07)', 'rgba(255,255,255,0.1)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  const lockedBg = useColorModeValue('purple.50', 'whiteAlpha.100')

  return (
    <Flex direction="column" minH="100vh" bg={pageBg} p={{ base: 5, md: 9 }}>

        {/* Header */}
        <Flex justify="space-between" align="center" mb={8} flexWrap="wrap" gap={3}>
            <HStack>
                <Button
                  leftIcon={<ArrowBackIcon />}
                  onClick={() => router.push('/admin/dashboard')}
                  borderRadius="10px"
                  variant="ghost"
                >
                  Back
                </Button>
                <Box>
                  <Heading
                    size="lg"
                    fontFamily="'Sora', sans-serif"
                    bgGradient="linear(to-r, purple.500, blue.400)"
                    bgClip="text"
                  >
                    Database Management
                  </Heading>
                  <Text fontSize="xs" color={dim}>MongoDB backup, restore, and configuration</Text>
                </Box>
            </HStack>
            <Badge
              colorScheme={dbVerified ? 'green' : 'red'}
              borderRadius="full"
              px={4}
              py={2}
              fontSize="sm"
              display="flex"
              alignItems="center"
              gap={1}
            >
              {dbVerified ? <CheckCircleIcon mr={1} /> : <WarningIcon mr={1} />}
              {dbVerified ? 'Connected' : 'Disconnected'}
            </Badge>
        </Flex>

        {/* Configuration Panel */}
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          p={7}
          borderRadius="20px"
          backdropFilter="blur(14px)"
          mb={7}
          position="relative"
          overflow="hidden"
        >
          <Box position="absolute" top={0} left={0} right={0} h="3px" bgImage="linear-gradient(135deg,#7c3aed,#3b82f6)" />
            <Flex justify="space-between" align="center" mb={5} flexWrap="wrap" gap={2}>
                <Heading size="md" fontFamily="'Sora', sans-serif">Connection Settings</Heading>
                <HStack>
                    <Badge
                      colorScheme={isEnv ? 'purple' : configSource === 'file' ? 'blue' : 'gray'}
                      borderRadius="full"
                      px={3}
                      py={1}
                      display="flex"
                      alignItems="center"
                      gap={1}
                    >
                      {isEnv && <LockIcon mr={1} />}
                      {isEnv ? 'Source: .env' : configSource === 'file' ? 'Source: saved file' : 'Source: defaults'}
                    </Badge>
                </HStack>
            </Flex>

            {isEnv && (
                <Alert status="info" borderRadius="12px" mb={5} fontSize="sm">
                    <AlertIcon />
                    <Box>
                        <Text fontWeight="bold">Managed by environment variables</Text>
                        <Text>
                            <code>MONGODB_URI</code> and <code>MONGODB_DB_NAME</code> are set in <code>.env</code>.
                            Edit the env file and restart the server to change the connection. The form is locked here on purpose (防呆).
                        </Text>
                    </Box>
                </Alert>
            )}

            <SimpleGrid columns={[1, 2]} gap={6}>
                 <FormControl>
                    <FormLabel>
                        Database URL
                        {isEnv && <Badge ml={2} colorScheme="purple" fontSize="0.65em">read-only</Badge>}
                    </FormLabel>
                    <InputGroup>
                        <Input
                            value={displayedUrl}
                            isReadOnly={isEnv}
                            onChange={(e) => {
                                if (isEnv) return
                                setDbConfig({...dbConfig, url: e.target.value})
                                setDbVerified(false)
                            }}
                            placeholder="mongodb://localhost:27017"
                            fontFamily={isEnv ? 'mono' : undefined}
                            bg={isEnv ? lockedBg : undefined}
                        />
                        <InputRightElement>
                            <Tooltip label={showUrl ? 'Hide credentials' : 'Reveal credentials'}>
                                <IconButton
                                    aria-label="Toggle URL visibility"
                                    size="sm"
                                    variant="ghost"
                                    icon={showUrl ? <ViewOffIcon /> : <ViewIcon />}
                                    onClick={() => setShowUrl((s) => !s)}
                                />
                            </Tooltip>
                        </InputRightElement>
                    </InputGroup>
                 </FormControl>
                 <FormControl>
                    <FormLabel>
                        Database Name
                        {isEnv && <Badge ml={2} colorScheme="purple" fontSize="0.65em">read-only</Badge>}
                    </FormLabel>
                    <Input
                        value={dbConfig.dbName}
                        isReadOnly={isEnv}
                        onChange={(e) => {
                            if (isEnv) return
                            setDbConfig({...dbConfig, dbName: e.target.value})
                        }}
                        placeholder="cv_database"
                        bg={isEnv ? lockedBg : undefined}
                    />
                 </FormControl>
                 {!isEnv && (
                    <>
                        <FormControl>
                            <FormLabel>Username (Optional)</FormLabel>
                            <Input
                                value={dbConfig.username}
                                onChange={(e) => {
                                    setDbConfig({...dbConfig, username: e.target.value})
                                    setDbVerified(false)
                                }}
                            />
                         </FormControl>
                         <FormControl>
                            <FormLabel>Password (Optional)</FormLabel>
                            <Input
                                type="password"
                                value={dbConfig.password}
                                onChange={(e) => {
                                    setDbConfig({...dbConfig, password: e.target.value})
                                    setDbVerified(false)
                                }}
                            />
                         </FormControl>
                    </>
                 )}
            </SimpleGrid>
            <Flex mt={6} justify="flex-end">
                <Button
                  colorScheme="purple"
                  borderRadius="10px"
                  onClick={testConnection}
                  isLoading={loading}
                  isDisabled={!dbConfig.url.trim() || !dbConfig.dbName.trim()}
                  leftIcon={dbVerified ? <CheckCircleIcon /> : undefined}
                >
                    {isEnv ? 'Test Connection' : 'Test Connection & Save'}
                </Button>
            </Flex>
        </Box>

        {/* Operations Panel */}
        <SimpleGrid columns={[1, 2]} gap={7}>

            {/* Backup */}
            <Box
              bg={cardBg}
              border="1px solid"
              borderColor={borderColor}
              p={7}
              borderRadius="20px"
              backdropFilter="blur(14px)"
              position="relative"
              overflow="hidden"
              opacity={dbVerified ? 1 : 0.55}
              pointerEvents={dbVerified ? 'all' : 'none'}
            >
              <Box position="absolute" top={0} left={0} right={0} h="3px" bgImage="linear-gradient(135deg,#1d4ed8,#3b82f6)" />
                <Heading size="md" mb={2} color="blue.500" fontFamily="'Sora', sans-serif">Backup</Heading>
                <Text mb={6} color={dim} fontSize="sm">Site → Database: save current content to MongoDB (CV data, home settings, MDX content under <code>content/</code>, images, and version snapshots).</Text>

                <VStack align="stretch" spacing={3}>
                    <Button onClick={() => performBackup('all')} colorScheme="blue" size="lg" borderRadius="12px" isLoading={loading}>
                        Backup Everything
                    </Button>
                    <HStack>
                        <Button flex={1} onClick={() => performBackup('cv')} borderRadius="10px" isLoading={loading}>CV Data</Button>
                        <Button flex={1} onClick={() => performBackup('home')} borderRadius="10px" isLoading={loading}>Home Settings</Button>
                    </HStack>
                    <HStack>
                        <Button flex={1} onClick={() => performBackup('content')} borderRadius="10px" isLoading={loading}>MDX Content</Button>
                        <Button flex={1} onClick={() => performBackup('images')} borderRadius="10px" isLoading={loading}>Images Only</Button>
                    </HStack>
                    <Button onClick={() => performBackup('snapshots')} borderRadius="10px" isLoading={loading}>Version Snapshots</Button>

                    {backupStatus && (
                        <Box p={3} bg="blue.50" borderRadius="12px" border="1px solid" borderColor="blue.100">
                            <Text fontSize="sm" fontWeight="bold" color="blue.700">Status: {backupStatus}</Text>
                        </Box>
                    )}
                </VStack>
            </Box>

            {/* Restore */}
            <Box
              bg={cardBg}
              border="1px solid"
              borderColor={borderColor}
              p={7}
              borderRadius="20px"
              backdropFilter="blur(14px)"
              position="relative"
              overflow="hidden"
              opacity={dbVerified ? 1 : 0.55}
              pointerEvents={dbVerified ? 'all' : 'none'}
            >
              <Box position="absolute" top={0} left={0} right={0} h="3px" bgImage="linear-gradient(135deg,#dd6b20,#f59e0b)" />
              <HStack mb={2}><WarningIcon color="orange.400"/><Heading size="md" color="orange.500" fontFamily="'Sora', sans-serif">Restore</Heading></HStack>
                <Text mb={6} color={dim} fontSize="sm">Database → Site: overwrite local files with stored backup (CV data, home settings, MDX content, images, and version snapshots).</Text>

                <VStack align="stretch" spacing={3}>
                    <Button onClick={() => requestRestore('all')} colorScheme="orange" size="lg" borderRadius="12px" isLoading={loading}>
                        Restore Everything
                    </Button>
                    <HStack>
                        <Button flex={1} onClick={() => requestRestore('cv')} borderRadius="10px" isLoading={loading}>CV Data</Button>
                        <Button flex={1} onClick={() => requestRestore('home')} borderRadius="10px" isLoading={loading}>Home Settings</Button>
                    </HStack>
                    <HStack>
                        <Button flex={1} onClick={() => requestRestore('content')} borderRadius="10px" isLoading={loading}>MDX Content</Button>
                        <Button flex={1} onClick={() => requestRestore('images')} borderRadius="10px" isLoading={loading}>Images Only</Button>
                    </HStack>
                    <Button onClick={() => requestRestore('snapshots')} borderRadius="10px" isLoading={loading}>Version Snapshots</Button>

                    {restoreStatus && (
                        <Box p={3} bg="orange.50" borderRadius="12px" border="1px solid" borderColor="orange.100">
                            <Text fontSize="sm" fontWeight="bold" color="orange.700">Status: {restoreStatus}</Text>
                        </Box>
                    )}
                </VStack>
            </Box>

        </SimpleGrid>

        {/* 防呆: typed-confirmation modal for destructive restores */}
        <Modal
          isOpen={!!pendingAction}
          onClose={() => setPendingAction(null)}
          isCentered
        >
            <ModalOverlay />
            <ModalContent borderRadius="16px">
                <ModalHeader>
                    <HStack><WarningIcon color="orange.500" /><Text>Confirm restore</Text></HStack>
                </ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <Text mb={3}>
                        This will <b>overwrite local files</b> ({pendingAction?.type}) with the
                        latest backup from MongoDB. This action cannot be undone.
                    </Text>
                    <Text mb={4} fontSize="sm" color="gray.500">
                        To proceed, type <b>{pendingAction?.word}</b> below.
                    </Text>
                    <Input
                        autoFocus
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        placeholder={pendingAction?.word}
                    />
                </ModalBody>
                <ModalFooter>
                    <Button mr={3} onClick={() => setPendingAction(null)} variant="ghost">Cancel</Button>
                    <Button
                        colorScheme="orange"
                        isDisabled={!pendingAction || confirmInput !== pendingAction.word}
                        onClick={async () => {
                            const p = pendingAction
                            setPendingAction(null)
                            setConfirmInput('')
                            if (p) await executeRestore(p.type)
                        }}
                    >
                        Restore
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>

    </Flex>
  )
}
