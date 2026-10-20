import { useEffect, useId, useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  InputGroup,
  InputLeftAddon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { inputProps, MONO, outlineButtonProps, primaryButtonProps, warnTextProps } from '../shell/ui'
import { SLUG_MAX, renameSlugProblem, slugFromTitle } from '../shell/publishChecks'
import type { RenamePlan, RenameResult } from '../shell/useMdxItemEditor'

/**
 * "Change the address" dialog of the post and case-study editors (H6).
 * Shows what the rename will do before it happens (a dry run on the
 * server: which posts, case studies, pages, the CV or the home page link
 * the old address and will be rewritten), keeps the old address as a
 * permanent redirect by default, and lists the older addresses that
 * already lead here (each can stop redirecting).
 */

const KIND_LABEL: Record<string, string> = { blog: 'Post', work: 'Case study', page: 'Page', cv: 'CV', home: 'Home page' }

type Props = {
  isOpen: boolean
  onClose: () => void
  collection: 'blog' | 'work'
  currentSlug: string
  title: string
  published: boolean
  dirty: boolean
  redirectsFrom: string[]
  planRename: (to: string, redirect: boolean) => Promise<RenamePlan>
  renameTo: (to: string, redirect: boolean) => Promise<RenameResult>
  removeRedirect: (from: string) => Promise<boolean>
}

export default function SlugRenameDialog({
  isOpen,
  onClose,
  collection,
  currentSlug,
  title,
  published,
  dirty,
  redirectsFrom,
  planRename,
  renameTo,
  removeRedirect,
}: Props) {
  const ids = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [redirect, setRedirect] = useState(published)
  const [plan, setPlan] = useState<RenamePlan | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  // "Stop redirecting" asks once more (the old address then answers 404).
  const [confirmStop, setConfirmStop] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setValue('')
    setRedirect(published)
    setPlan(null)
    setError('')
    setConfirmStop(null)
  }, [isOpen, published])

  const local = renameSlugProblem(value, currentSlug)
  const valid = !!value && !local

  // Dry run 400 ms after the last keystroke.
  useEffect(() => {
    if (!isOpen || !valid) {
      setPlan(null)
      setChecking(false)
      return
    }
    let alive = true
    setChecking(true)
    const timer = setTimeout(async () => {
      const out = await planRename(value, redirect)
      if (!alive) return
      setPlan(out)
      setChecking(false)
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [isOpen, valid, value, redirect, planRename])

  const serverProblem = plan && !plan.ok ? plan.error : ''
  const suggestion = slugFromTitle(title)
  const canRename = valid && !dirty && !busy && !checking && !!plan && plan.ok

  const submit = async () => {
    if (!canRename) return
    setBusy(true)
    setError('')
    const out = await renameTo(value, redirect)
    setBusy(false)
    if (out.ok) onClose()
    else setError(out.error)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} initialFocusRef={inputRef} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="page.bg-elevated" border="1px solid" borderColor="page.border" mx={4}>
        <ModalHeader fontSize="md" pb={1} pr={12}>
          Change the address
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Text fontSize="sm" color="page.fg-secondary">
              Now at{' '}
              <Text as="span" fontFamily={MONO} color="page.fg">
                /{collection}/{currentSlug}
              </Text>
            </Text>
            <FormControl isInvalid={!!local || !!serverProblem}>
              <FormLabel fontSize="13px" htmlFor={`${ids}-slug`}>
                New slug
              </FormLabel>
              <InputGroup size="md">
                <InputLeftAddon fontFamily={MONO} fontSize="13px" bg="page.bg" borderColor="page.border-strong" color="page.fg-secondary">
                  /{collection}/
                </InputLeftAddon>
                <Input
                  {...inputProps}
                  ref={inputRef}
                  id={`${ids}-slug`}
                  value={value}
                  onChange={(e) => setValue(e.target.value.trim().toLowerCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void submit()
                    }
                  }}
                  fontFamily={MONO}
                  fontSize="14px"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={SLUG_MAX + 8}
                  aria-describedby={`${ids}-help`}
                />
              </InputGroup>
              {local || serverProblem ? (
                <FormErrorMessage fontSize="xs">{local || serverProblem}</FormErrorMessage>
              ) : (
                <FormHelperText id={`${ids}-help`} fontSize="xs" color="page.fg-secondary">
                  a–z, 0–9, - and _.
                  {suggestion && suggestion !== currentSlug && suggestion !== value ? (
                    <>
                      {' '}
                      <Button size="xs" variant="link" color="accent.text" onClick={() => setValue(suggestion)}>
                        Use “{suggestion}”
                      </Button>
                    </>
                  ) : null}
                </FormHelperText>
              )}
            </FormControl>

            <Checkbox colorScheme="accent" isChecked={redirect} onChange={(e) => setRedirect(e.target.checked)} alignItems="flex-start">
              <Text as="span" fontSize="sm">
                Keep links to the old address working
              </Text>
              <Text as="span" display="block" fontSize="xs" color="page.fg-secondary">
                Visitors and search engines that open /{collection}/{currentSlug} — from LinkedIn, WeChat, a bookmark — are sent to the new address with a permanent (308) redirect.
                {published ? '' : ' This draft is not public, so its old address may not need one.'}
              </Text>
            </Checkbox>

            <Box role="status" aria-live="polite" fontSize="sm" minH="44px">
              {checking ? (
                <Flex align="center" gap={2} color="page.fg-secondary">
                  <Spinner size="xs" /> Checking which pages link here…
                </Flex>
              ) : plan && plan.ok ? (
                plan.rewrites.length ? (
                  <Box>
                    <Text>
                      Updates {plan.links} internal link{plan.links === 1 ? '' : 's'} to the new address in:
                    </Text>
                    <Box as="ul" mt={1.5} pl={5} fontSize="13px" color="page.fg-secondary">
                      {plan.rewrites.map((r) => (
                        <Box as="li" key={`${r.kind}:${r.ref}`}>
                          {KIND_LABEL[r.kind] || r.kind}: {r.title} ({r.links})
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Text color="page.fg-secondary">No other page on the site links the old address.</Text>
                )
              ) : null}
              {plan && plan.ok && plan.takesOverRedirectTo ? (
                <Text fontSize="xs" mt={2} {...warnTextProps}>
                  /{collection}/{value} redirects to /{collection}/{plan.takesOverRedirectTo} today. Taking it over stops that redirect: links to it will open this {collection === 'blog' ? 'post' : 'case study'}.
                </Text>
              ) : null}
            </Box>

            {redirectsFrom.length ? (
              <Box>
                <Text fontSize="13px" fontWeight={500}>
                  Older addresses that lead here
                </Text>
                <Text fontSize="xs" color="page.fg-secondary" mb={1.5}>
                  They follow it to the new address too — never a chain of redirects.
                </Text>
                <Stack as="ul" listStyleType="none" spacing={1}>
                  {redirectsFrom.map((from) => (
                    <Flex as="li" key={from} align="center" justify="space-between" gap={3}>
                      <Text fontFamily={MONO} fontSize="12px">
                        /{collection}/{from}
                      </Text>
                      <Button
                        size="xs"
                        minH="28px"
                        variant={confirmStop === from ? 'solid' : 'ghost'}
                        colorScheme={confirmStop === from ? 'red' : undefined}
                        color={confirmStop === from ? undefined : 'page.fg-secondary'}
                        isLoading={removing === from}
                        aria-label={confirmStop === from ? `Confirm: /${collection}/${from} stops redirecting and answers 404` : `Stop redirecting /${collection}/${from}`}
                        onBlur={() => setConfirmStop((c) => (c === from ? null : c))}
                        onClick={async () => {
                          if (confirmStop !== from) {
                            setConfirmStop(from)
                            return
                          }
                          setRemoving(from)
                          await removeRedirect(from)
                          setRemoving(null)
                          setConfirmStop(null)
                        }}
                      >
                        {confirmStop === from ? 'Confirm — answer 404' : 'Stop redirecting'}
                      </Button>
                    </Flex>
                  ))}
                </Stack>
              </Box>
            ) : null}

            {dirty ? (
              <Text fontSize="sm" {...warnTextProps}>
                Save your edits first — the address change moves the stored version.
              </Text>
            ) : null}
            {error ? (
              <Text fontSize="sm" color="status.error" role="alert">
                {error}
              </Text>
            ) : null}
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button size="sm" {...outlineButtonProps} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" {...primaryButtonProps} onClick={() => void submit()} isDisabled={!canRename} isLoading={busy} loadingText="Moving">
            Change address
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
