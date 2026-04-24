import React, { useState, useEffect } from 'react'
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
  Badge
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { ArrowBackIcon, CheckCircleIcon, WarningIcon } from '@chakra-ui/icons'

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
    dbName: 'site_backup_db'
  })
  const [dbVerified, setDbVerified] = useState(false)
  
  // Status
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null)

  // Load Config on Mount
  useEffect(() => {
     const loadConfig = async () => {
         try {
             // 1. Try server config
             const res = await fetch('/api/mongo')
             const data = await res.json()
             if (data.ok && data.config) {
                 setDbConfig(data.config)
                 // Auto-verify if config loaded? Maybe not automatically connect for security, user action needed.
             } else {
                 // 2. Local storage fallback
                 const saved = localStorage.getItem('cv_mongo_config')
                 if (saved) {
                     try { setDbConfig(JSON.parse(saved)) } catch(e){}
                 }
             }
         } catch (e) {
             console.error('Failed to load DB config', e)
         }
     }
     loadConfig()
  }, [])

  // Auto-save to Local Storage
  useEffect(() => {
      const timer = setTimeout(() => {
        localStorage.setItem('cv_mongo_config', JSON.stringify(dbConfig))
      }, 500)
      return () => clearTimeout(timer)
  }, [dbConfig])

  // Helper: Connection String
  const constructUrl = () => {
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
          } else {
              setDbVerified(false)
              throw new Error(data.message)
          }
      } catch (e: any) {
          setDbVerified(false)
          toast({ status: 'error', title: 'Connection Failed', description: e.message })
      } finally {
          setLoading(false)
      }
  }

  const performBackup = async (type: 'all' | 'cv' | 'home' | 'images') => {
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

  const performRestore = async (type: 'all' | 'cv' | 'home' | 'images') => {
      if (!dbVerified) return toast({ status: 'warning', title: 'Not Connected' })
      if (!confirm(`Restore ${type} from DB? WARNNG: This will OVERWRITE local files.`)) return

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

  const pageBg = useColorModeValue('gray.50', 'gray.900')
  const cardBg = useColorModeValue('rgba(255,255,255,0.9)', 'rgba(30,41,59,0.7)')
  const borderColor = useColorModeValue('rgba(0,0,0,0.07)', 'rgba(255,255,255,0.1)')
  const dim = useColorModeValue('gray.600', 'gray.400')

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
            <Heading size="md" mb={5} fontFamily="'Sora', sans-serif">Connection Settings</Heading>
            <SimpleGrid columns={[1, 2]} gap={6}>
                 <FormControl>
                    <FormLabel>Database URL</FormLabel>
                    <Input 
                        value={dbConfig.url} 
                        onChange={(e) => {
                            setDbConfig({...dbConfig, url: e.target.value})
                            setDbVerified(false)
                        }} 
                        placeholder="mongodb://localhost:27017"
                    />
                 </FormControl>
                 <FormControl>
                    <FormLabel>Database Name</FormLabel>
                    <Input 
                        value={dbConfig.dbName} 
                        onChange={(e) => setDbConfig({...dbConfig, dbName: e.target.value})} 
                        placeholder="site_backup_db"
                    />
                 </FormControl>
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
            </SimpleGrid>
            <Flex mt={6} justify="flex-end">
                <Button
                  colorScheme="purple"
                  borderRadius="10px"
                  onClick={testConnection}
                  isLoading={loading}
                  leftIcon={dbVerified ? <CheckCircleIcon /> : undefined}
                >
                    Test Connection & Save
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
                <Text mb={6} color={dim} fontSize="sm">Site → Database: save current content to MongoDB.</Text>

                <VStack align="stretch" spacing={3}>
                    <Button onClick={() => performBackup('all')} colorScheme="blue" size="lg" borderRadius="12px" isLoading={loading}>
                        Backup Everything
                    </Button>
                    <HStack>
                        <Button flex={1} onClick={() => performBackup('cv')} borderRadius="10px" isLoading={loading}>CV Data</Button>
                        <Button flex={1} onClick={() => performBackup('home')} borderRadius="10px" isLoading={loading}>Home Settings</Button>
                    </HStack>
                    <Button onClick={() => performBackup('images')} borderRadius="10px" isLoading={loading}>Images Only</Button>

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
                <Text mb={6} color={dim} fontSize="sm">Database → Site: overwrite local files with stored backup.</Text>

                <VStack align="stretch" spacing={3}>
                    <Button onClick={() => performRestore('all')} colorScheme="orange" size="lg" borderRadius="12px" isLoading={loading}>
                        Restore Everything
                    </Button>
                    <HStack>
                        <Button flex={1} onClick={() => performRestore('cv')} borderRadius="10px" isLoading={loading}>CV Data</Button>
                        <Button flex={1} onClick={() => performRestore('home')} borderRadius="10px" isLoading={loading}>Home Settings</Button>
                    </HStack>
                    <Button onClick={() => performRestore('images')} borderRadius="10px" isLoading={loading}>Images Only</Button>

                    {restoreStatus && (
                        <Box p={3} bg="orange.50" borderRadius="12px" border="1px solid" borderColor="orange.100">
                            <Text fontSize="sm" fontWeight="bold" color="orange.700">Status: {restoreStatus}</Text>
                        </Box>
                    )}
                </VStack>
            </Box>

        </SimpleGrid>

    </Flex>
  )
}
