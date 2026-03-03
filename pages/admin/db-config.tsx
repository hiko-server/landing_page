import React, { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  SimpleGrid,
  Text,
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

  return (
    <Flex direction="column" minH="100vh" bg="gray.50" p={8}>
        
        {/* Header */}
        <Flex justify="space-between" align="center" mb={8}>
            <HStack>
                <Button leftIcon={<ArrowBackIcon />} onClick={() => router.push('/admin/dashboard')}>Back to Dashboard</Button>
                <Heading size="lg">Database Management</Heading>
            </HStack>
            <Badge colorScheme={dbVerified ? 'green' : 'red'} p={2} borderRadius="md" fontSize="md">
                {dbVerified ? 'Connected' : 'Disconnected'}
            </Badge>
        </Flex>

        {/* Configuration Panel */}
        <Box bg="white" p={6} borderRadius="lg" shadow="sm" mb={8}>
            <Heading size="md" mb={4}>Connection Settings</Heading>
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
                <Button colorScheme="blue" onClick={testConnection} isLoading={loading} leftIcon={dbVerified ? <CheckCircleIcon /> : undefined}>
                    Test Connection & Save
                </Button>
            </Flex>
        </Box>

        {/* Operations Panel */}
        <SimpleGrid columns={[1, 2]} gap={8}>
            
            {/* Backup */}
            <Box bg="white" p={6} borderRadius="lg" shadow="sm" position="relative" opacity={dbVerified ? 1 : 0.6} pointerEvents={dbVerified ? 'all' : 'none'}>
                <Heading size="md" mb={4} color="blue.600">Backup (Site -{'>'} DB)</Heading>
                <Text mb={6} color="gray.500">Save current site content, settings, and files to the database.</Text>
                
                <VStack align="stretch" spacing={4}>
                    <Button onClick={() => performBackup('all')} colorScheme="blue" size="lg" isLoading={loading}>
                        Backup Everything
                    </Button>
                    <HStack>
                        <Button flex={1} onClick={() => performBackup('cv')} isLoading={loading}>Backup CV Data</Button>
                        <Button flex={1} onClick={() => performBackup('home')} isLoading={loading}>Backup Home Settings</Button>
                    </HStack>
                    <Button onClick={() => performBackup('images')} isLoading={loading}>Backup Images Only</Button>

                    {backupStatus && (
                        <Box p={3} bg="blue.50" borderRadius="md">
                            <Text fontSize="sm" fontWeight="bold">Status: {backupStatus}</Text>
                        </Box>
                    )}
                </VStack>
            </Box>

            {/* Restore */}
            <Box bg="white" p={6} borderRadius="lg" shadow="sm" position="relative" opacity={dbVerified ? 1 : 0.6} pointerEvents={dbVerified ? 'all' : 'none'}>
                <HStack mb={4}><WarningIcon color="orange.500"/><Heading size="md" color="orange.600">Restore (DB -{'>'} Site)</Heading></HStack>
                <Text mb={6} color="gray.500">Overwrite local site files with data from the database.</Text>
                
                <VStack align="stretch" spacing={4}>
                    <Button onClick={() => performRestore('all')} colorScheme="orange" size="lg" isLoading={loading}>
                        Restore Everything
                    </Button>
                    <HStack>
                        <Button flex={1} onClick={() => performRestore('cv')} isLoading={loading}>Restore CV Data</Button>
                        <Button flex={1} onClick={() => performRestore('home')} isLoading={loading}>Restore Home Settings</Button>
                    </HStack>
                    <Button onClick={() => performRestore('images')} isLoading={loading}>Restore Images Only</Button>

                    {restoreStatus && (
                        <Box p={3} bg="orange.50" borderRadius="md">
                            <Text fontSize="sm" fontWeight="bold">Status: {restoreStatus}</Text>
                        </Box>
                    )}
                </VStack>
            </Box>

        </SimpleGrid>

    </Flex>
  )
}
