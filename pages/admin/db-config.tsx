import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Code,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  useToast,
} from '@chakra-ui/react'
import { CheckCircleIcon, WarningIcon, LockIcon, ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import {
  AdminPageShell,
  BackLink,
  Eyebrow,
  MONO,
  Panel,
  inputProps,
  outlineButtonProps,
  primaryButtonProps,
} from '../../components/Admin/shell/ui'

type OpType = 'all' | 'cv' | 'home' | 'images' | 'content' | 'snapshots'

const OPS: Array<{ type: Exclude<OpType, 'all'>; label: string }> = [
  { type: 'cv', label: 'CV data' },
  { type: 'home', label: 'Home settings' },
  { type: 'content', label: 'MDX content' },
  { type: 'images', label: 'Images' },
  { type: 'snapshots', label: 'Version snapshots' },
]

// -----------------------------------------------------------------------------
// Helpers — 防呆 (fool-proofing) display utilities
// -----------------------------------------------------------------------------

/** Mask the password section of a mongodb[+srv]://user:pass@host URI. */
function maskMongoUri(uri: string): string {
  if (!uri) return ''
  return uri.replace(
    /(mongodb(?:\+srv)?:\/\/[^:/?#]+:)([^@]+)(@)/i,
    (_m, a, _p, c) => `${a}••••••••${c}`
  )
}

// -----------------------------------------------------------------------------
// Database Configuration Page
// -----------------------------------------------------------------------------

export default function DbConfigPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [dbConfig, setDbConfig] = useState({
    url: 'mongodb://localhost:27017',
    username: '',
    password: '',
    dbName: 'cv_database',
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
    type: OpType
    word: string
  }>(null)

  const isEnv = configSource === 'env'
  const confirmInputRef = useRef<HTMLInputElement>(null)

  // Load config on mount. Credentials are never kept in browser storage (an
  // older version cached the full URI in localStorage — clear that copy).
  useEffect(() => {
    try {
      localStorage.removeItem('cv_mongo_config')
    } catch {
      /* ignore */
    }
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/mongo')
        const data = await res.json()
        if (data.ok && data.config) {
          setDbConfig({
            url: '',
            username: '',
            password: '',
            dbName: 'cv_database',
            ...data.config,
          })
          setConfigSource(data.fromEnv ? 'env' : 'file')
        } else {
          setConfigSource('default')
        }
      } catch (e) {
        console.error('Failed to load DB config', e)
      }
    }
    loadConfig()
  }, [])

  // A stored / env URL comes back with its password masked ("••••"). It can
  // be used as-is (the server swaps the real one back in) but not edited in
  // place — editing would bake the dots into the password.
  const urlIsMasked = dbConfig.url.includes('••••')

  // Helper: Connection String
  const constructUrl = () => {
    // When env owns the config, the URL already contains credentials —
    // do not splice anything in from the disabled username/password fields.
    if (isEnv) return dbConfig.url.trim()
    let uri = dbConfig.url.trim()
    if (dbConfig.username) {
      uri = uri
        .replace('<db_username>', encodeURIComponent(dbConfig.username))
        .replace('<username>', encodeURIComponent(dbConfig.username))
    }
    if (dbConfig.password) {
      uri = uri
        .replace('<db_password>', encodeURIComponent(dbConfig.password))
        .replace('<password>', encodeURIComponent(dbConfig.password))
    }
    if (dbConfig.username && dbConfig.password && !uri.includes('@')) {
      if (uri.includes('://')) {
        const parts = uri.split('://')
        if (parts.length === 2)
          uri = `${parts[0]}://${encodeURIComponent(dbConfig.username)}:${encodeURIComponent(dbConfig.password)}@${parts[1]}`
      } else {
        uri = `mongodb://${encodeURIComponent(dbConfig.username)}:${encodeURIComponent(dbConfig.password)}@${uri}`
      }
    }
    return uri
  }

  const saveConfigToServer = async (cfg: any) => {
    // 防呆: never push config to the server when env owns it (the API
    // would reject this anyway), nor an unchanged masked URL.
    if (isEnv || String(cfg?.url || '').includes('••••')) return
    try {
      await fetch('/api/mongo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', config: cfg }),
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
      toast({
        status: 'warning',
        title: 'Invalid URL',
        description: 'Expected a mongodb:// or mongodb+srv:// connection string.',
      })
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
        body: JSON.stringify({ action: 'test', config: { ...dbConfig, url: uri } }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setDbVerified(true)
        toast({ status: 'success', title: 'Connected!', description: 'Database is reachable.' })
        saveConfigToServer({ url: uri, dbName: dbConfig.dbName })
        setLoading(false)
        return
      }
      // Failure: server returns { ok: false, message, error, code, hint }
      setDbVerified(false)
      const description =
        [data.hint, data.error, data.code && `code: ${data.code}`].filter(Boolean).join('  ·  ') ||
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
      toast({
        status: 'error',
        title: 'Connection Failed',
        description: e?.message || 'Network error',
      })
    } finally {
      setLoading(false)
    }
  }

  const performBackup = async (type: OpType) => {
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
          config: { ...dbConfig, url: uri },
        }),
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
  const requestRestore = (type: OpType) => {
    if (!dbVerified) return toast({ status: 'warning', title: 'Not Connected' })
    const word = `RESTORE-${type.toUpperCase()}`
    setConfirmInput('')
    setPendingAction({ kind: 'restore', type, word })
  }

  const executeRestore = async (type: OpType) => {
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
          config: { ...dbConfig, url: uri },
        }),
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
    () => (showUrl || urlIsMasked ? dbConfig.url : maskMongoUri(dbConfig.url)),
    [dbConfig.url, showUrl, urlIsMasked]
  )
  // Typing into a masked display would write the dots into the password.
  const urlReadOnly = isEnv || urlIsMasked || (!showUrl && /:\/\/[^/@]+:[^@]+@/.test(dbConfig.url))

  const statusBadge = (
    <Badge
      colorScheme={dbVerified ? 'green' : 'gray'}
      variant="subtle"
      borderRadius="full"
      px={2.5}
      py={1}
      fontSize="10px"
      fontFamily={MONO}
      display="flex"
      alignItems="center"
      gap={1}
      role="status"
    >
      {dbVerified ? (
        <CheckCircleIcon boxSize={2.5} aria-hidden />
      ) : (
        <WarningIcon boxSize={2.5} aria-hidden />
      )}
      {dbVerified ? 'connected' : 'not connected'}
    </Badge>
  )

  const opsLocked = !dbVerified

  return (
    <AdminPageShell
      headTitle="Admin · MongoDB backup"
      eyebrow="[admin] mongodb"
      title="MongoDB backup"
      status={statusBadge}
      actions={<BackLink href="/admin/dashboard?tab=storage">← Dashboard</BackLink>}
    >
      <Text fontSize="sm" color="page.fg-secondary" mb={6} maxW="70ch">
        Optional external backup target. Connect once, then copy site content to MongoDB or bring it
        back. The primary backup is the SQLite + R2 snapshot under Dashboard → Storage.
      </Text>

      {/* Configuration Panel */}
      <Panel mb={6}>
        <Flex justify="space-between" align="center" mb={5} flexWrap="wrap" gap={2}>
          <Box>
            <Eyebrow accent>[01]</Eyebrow>
            <Heading as="h2" fontSize="md" fontWeight={600} mt={1}>
              Connection
            </Heading>
          </Box>
          <Badge
            variant="outline"
            borderRadius="full"
            px={2.5}
            py={1}
            fontSize="10px"
            fontFamily={MONO}
            display="flex"
            alignItems="center"
            gap={1}
            color="page.fg-secondary"
          >
            {isEnv && <LockIcon boxSize={2.5} aria-hidden />}
            {isEnv
              ? 'source: .env'
              : configSource === 'file'
                ? 'source: saved file'
                : 'source: defaults'}
          </Badge>
        </Flex>

        {isEnv && (
          <Alert
            status="info"
            variant="left-accent"
            borderRadius="md"
            mb={5}
            fontSize="sm"
            bg="page.bg-elevated"
            alignItems="flex-start"
          >
            <AlertIcon mt={0.5} />
            <Box>
              <Text fontWeight={600}>Managed by environment variables</Text>
              <Text>
                <Code fontSize="xs">MONGODB_URI</Code> and{' '}
                <Code fontSize="xs">MONGODB_DB_NAME</Code> are set in{' '}
                <Code fontSize="xs">.env</Code>. Edit the env file and restart the server to change
                the connection — the form is locked here on purpose.
              </Text>
            </Box>
          </Alert>
        )}

        <SimpleGrid columns={{ base: 1, md: 2 }} gap={5}>
          <FormControl>
            <FormLabel fontSize="13px">
              Database URL
              {isEnv && (
                <Badge ml={2} variant="outline" fontSize="9px">
                  read-only
                </Badge>
              )}
            </FormLabel>
            <InputGroup>
              <Input
                {...inputProps}
                value={displayedUrl}
                isReadOnly={urlReadOnly}
                onChange={(e) => {
                  if (urlReadOnly) return
                  setDbConfig({ ...dbConfig, url: e.target.value })
                  setDbVerified(false)
                }}
                placeholder="mongodb://localhost:27017"
                fontFamily={MONO}
                fontSize="13px"
                bg={isEnv ? 'page.bg-elevated' : undefined}
                autoComplete="off"
                spellCheck={false}
                pr="44px"
              />
              <InputRightElement>
                {urlIsMasked ? null : (
                  <Tooltip label={showUrl ? 'Hide credentials' : 'Reveal credentials to edit'}>
                    <IconButton
                      aria-label="Show credentials"
                      aria-pressed={showUrl}
                      size="sm"
                      variant="ghost"
                      color="page.fg-secondary"
                      icon={showUrl ? <ViewOffIcon /> : <ViewIcon />}
                      onClick={() => setShowUrl((s) => !s)}
                    />
                  </Tooltip>
                )}
              </InputRightElement>
            </InputGroup>
            {urlIsMasked && !isEnv ? (
              <HStack mt={1.5} spacing={2} fontSize="xs" color="page.fg-secondary">
                <Text>Saved credentials stay on the server.</Text>
                <Button
                  size="xs"
                  variant="link"
                  color="accent.500"
                  onClick={() => {
                    setDbConfig({ ...dbConfig, url: '' })
                    setDbVerified(false)
                    setShowUrl(true)
                  }}
                >
                  Replace URL
                </Button>
              </HStack>
            ) : null}
          </FormControl>
          <FormControl>
            <FormLabel fontSize="13px">
              Database name
              {isEnv && (
                <Badge ml={2} variant="outline" fontSize="9px">
                  read-only
                </Badge>
              )}
            </FormLabel>
            <Input
              {...inputProps}
              value={dbConfig.dbName}
              isReadOnly={isEnv}
              onChange={(e) => {
                if (isEnv) return
                setDbConfig({ ...dbConfig, dbName: e.target.value })
              }}
              placeholder="cv_database"
              bg={isEnv ? 'page.bg-elevated' : undefined}
              autoComplete="off"
            />
          </FormControl>
          {!isEnv && (
            <>
              <FormControl>
                <FormLabel fontSize="13px">Username (optional)</FormLabel>
                <Input
                  {...inputProps}
                  value={dbConfig.username}
                  autoComplete="off"
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, username: e.target.value })
                    setDbVerified(false)
                  }}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="13px">Password (optional)</FormLabel>
                <Input
                  {...inputProps}
                  type="password"
                  autoComplete="new-password"
                  value={dbConfig.password}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, password: e.target.value })
                    setDbVerified(false)
                  }}
                />
              </FormControl>
            </>
          )}
        </SimpleGrid>
        <Flex mt={6} justify="flex-end">
          <Button
            size="sm"
            {...primaryButtonProps}
            onClick={testConnection}
            isLoading={loading}
            isDisabled={!dbConfig.url.trim() || !dbConfig.dbName.trim()}
            leftIcon={dbVerified ? <CheckCircleIcon /> : undefined}
          >
            {isEnv ? 'Test connection' : 'Test connection & save'}
          </Button>
        </Flex>
      </Panel>

      {opsLocked ? (
        <Text fontSize="sm" color="page.fg-secondary" mb={3} role="note">
          Test the connection first — backup and restore unlock once MongoDB is reachable.
        </Text>
      ) : null}

      {/* Operations */}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
        <Panel as="section" aria-labelledby="mongo-backup-title" opacity={opsLocked ? 0.6 : 1}>
          <Eyebrow accent>[02]</Eyebrow>
          <Heading as="h2" id="mongo-backup-title" fontSize="md" fontWeight={600} mt={1} mb={2}>
            Backup
          </Heading>
          <Text mb={5} color="page.fg-secondary" fontSize="sm">
            Site → MongoDB: copy CV data, home settings, MDX content, images and version snapshots.
          </Text>
          <Stack spacing={2.5}>
            <Button
              {...primaryButtonProps}
              onClick={() => performBackup('all')}
              isLoading={loading}
              isDisabled={opsLocked}
            >
              Back up everything
            </Button>
            <SimpleGrid columns={2} gap={2.5}>
              {OPS.map((op) => (
                <Button
                  key={op.type}
                  size="sm"
                  {...outlineButtonProps}
                  onClick={() => performBackup(op.type)}
                  isLoading={loading}
                  isDisabled={opsLocked}
                >
                  {op.label}
                </Button>
              ))}
            </SimpleGrid>
            {backupStatus && (
              <Text
                fontSize="sm"
                p={3}
                borderRadius="md"
                border="1px solid"
                borderColor="page.border"
                bg="page.bg-elevated"
                role="status"
              >
                {backupStatus}
              </Text>
            )}
          </Stack>
        </Panel>

        <Panel as="section" aria-labelledby="mongo-restore-title" opacity={opsLocked ? 0.6 : 1}>
          <Eyebrow color="orange.400">[03]</Eyebrow>
          <Heading as="h2" id="mongo-restore-title" fontSize="md" fontWeight={600} mt={1} mb={2}>
            Restore
          </Heading>
          <Text mb={5} color="page.fg-secondary" fontSize="sm">
            MongoDB → site: overwrite local content with the stored backup. Each restore asks for a
            typed confirmation.
          </Text>
          <Stack spacing={2.5}>
            <Button
              colorScheme="orange"
              onClick={() => requestRestore('all')}
              isLoading={loading}
              isDisabled={opsLocked}
            >
              Restore everything
            </Button>
            <SimpleGrid columns={2} gap={2.5}>
              {OPS.map((op) => (
                <Button
                  key={op.type}
                  size="sm"
                  {...outlineButtonProps}
                  onClick={() => requestRestore(op.type)}
                  isLoading={loading}
                  isDisabled={opsLocked}
                >
                  {op.label}
                </Button>
              ))}
            </SimpleGrid>
            {restoreStatus && (
              <Text
                fontSize="sm"
                p={3}
                borderRadius="md"
                border="1px solid"
                borderColor="page.border"
                bg="page.bg-elevated"
                role="status"
              >
                {restoreStatus}
              </Text>
            )}
          </Stack>
        </Panel>
      </SimpleGrid>

      {/* Typed confirmation for destructive restores */}
      <Modal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        isCentered
        initialFocusRef={confirmInputRef}
      >
        <ModalOverlay />
        <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
          <ModalHeader fontSize="md">
            <HStack>
              <WarningIcon color="orange.400" aria-hidden />
              <Text>Confirm restore</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody fontSize="sm">
            <Text mb={3}>
              This <strong>overwrites local content</strong> ({pendingAction?.type}) with the latest
              backup from MongoDB. It can’t be undone from here.
            </Text>
            <FormControl>
              <FormLabel fontSize="13px" color="page.fg-secondary">
                Type <Code fontSize="xs">{pendingAction?.word}</Code> to continue
              </FormLabel>
              <Input
                {...inputProps}
                ref={confirmInputRef}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={pendingAction?.word}
                fontFamily={MONO}
                autoComplete="off"
                spellCheck={false}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button size="sm" {...outlineButtonProps} onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
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
    </AdminPageShell>
  )
}
