import React, { useId, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  type InputProps,
} from '@chakra-ui/react'
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import { Eyebrow, inputProps, primaryButtonProps } from './shell/ui'

/**
 * Shared shell for the admin auth pages (login / forgot / reset): a single
 * centered hairline card in the public v6 look — mono eyebrow, indigo
 * accent, labelled inputs with inline errors, one primary action.
 */

export function AuthCard({
  eyebrow = '[admin]',
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Flex align="center" justify="center" px={4} py={{ base: 10, md: 20 }} minH="70vh">
      <Box
        as="section"
        aria-labelledby="auth-title"
        w="full"
        maxW="400px"
        border="1px solid"
        borderColor="page.border"
        bg="page.surface"
        backdropFilter="saturate(180%) blur(12px)"
        borderRadius="xl"
        p={{ base: 6, md: 8 }}
        boxShadow="0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -12px rgba(0,0,0,0.18)"
      >
        <Eyebrow accent>{eyebrow}</Eyebrow>
        <Heading
          as="h1"
          id="auth-title"
          fontSize="xl"
          fontWeight={600}
          mt={2}
          letterSpacing="-0.02em"
        >
          {title}
        </Heading>
        {subtitle ? (
          <Text mt={1.5} fontSize="13px" color="page.fg-secondary">
            {subtitle}
          </Text>
        ) : null}
        <Box mt={6}>{children}</Box>
        {footer ? (
          <Box mt={5} pt={4} borderTop="1px solid" borderColor="page.border" fontSize="13px">
            {footer}
          </Box>
        ) : null}
      </Box>
    </Flex>
  )
}

type FieldProps = {
  label: string
  /** Inline error; marks the field invalid and is announced. */
  error?: string
  helper?: React.ReactNode
  inputRef?: React.Ref<HTMLInputElement>
} & Omit<InputProps, 'isInvalid'>

export function AuthField({ label, error, helper, inputRef, isRequired, ...props }: FieldProps) {
  return (
    <FormControl isRequired={isRequired} isInvalid={!!error}>
      <FormLabel fontSize="12px" fontWeight={500} mb={1.5}>
        {label}
      </FormLabel>
      <Input ref={inputRef} size="md" fontSize="14px" {...inputProps} {...props} />
      {helper && !error ? (
        <FormHelperText fontSize="12px" color="page.fg-secondary">
          {helper}
        </FormHelperText>
      ) : null}
      <FormErrorMessage fontSize="12px">{error}</FormErrorMessage>
    </FormControl>
  )
}

/**
 * Password input with a keyboard-reachable show / hide toggle (aria-pressed)
 * and a Caps Lock hint, both wired to the input via aria attributes.
 */
export function PasswordField({
  label,
  error,
  helper,
  inputRef,
  isRequired,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: FieldProps) {
  const [show, setShow] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const id = useId()
  const inputId = `${id}-input`
  const capsId = `${id}-caps`

  const readCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'))
  }

  return (
    <FormControl isRequired={isRequired} isInvalid={!!error}>
      <FormLabel htmlFor={inputId} fontSize="12px" fontWeight={500} mb={1.5}>
        {label}
      </FormLabel>
      <InputGroup>
        <Input
          ref={inputRef}
          id={inputId}
          size="md"
          fontSize="14px"
          pr="48px"
          {...inputProps}
          type={show ? 'text' : 'password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={capsLock ? capsId : undefined}
          onKeyDown={(e) => {
            readCaps(e)
            onKeyDown?.(e)
          }}
          onKeyUp={(e) => {
            readCaps(e)
            onKeyUp?.(e)
          }}
          onBlur={(e) => {
            setCapsLock(false)
            onBlur?.(e)
          }}
          {...props}
        />
        <InputRightElement w="48px">
          <IconButton
            aria-label="Show password"
            aria-pressed={show}
            aria-controls={inputId}
            icon={show ? <ViewOffIcon /> : <ViewIcon />}
            size="sm"
            variant="ghost"
            color="page.fg-secondary"
            _hover={{ color: 'page.fg', bg: 'page.bg-overlay' }}
            onClick={() => setShow((v) => !v)}
            isDisabled={props.isDisabled}
          />
        </InputRightElement>
      </InputGroup>
      {capsLock ? (
        <Text id={capsId} mt={1.5} fontSize="12px" color="orange.400" role="status">
          Caps Lock is on.
        </Text>
      ) : null}
      {helper && !error ? (
        <FormHelperText fontSize="12px" color="page.fg-secondary">
          {helper}
        </FormHelperText>
      ) : null}
      <FormErrorMessage fontSize="12px">{error}</FormErrorMessage>
    </FormControl>
  )
}

/**
 * Form-level error. The live region is always mounted so screen readers
 * announce a message the moment it appears.
 */
export function AuthError({ children }: { children?: React.ReactNode }) {
  return (
    <Box role="alert" aria-live="assertive" aria-atomic="true">
      {children ? (
        <Alert
          // The wrapper is the live region; a second role="alert" inside it
          // could make screen readers announce the message twice.
          role="presentation"
          status="error"
          variant="left-accent"
          borderRadius="md"
          mb={4}
          fontSize="13px"
          bg="page.bg-elevated"
        >
          <AlertIcon />
          <AlertDescription>{children}</AlertDescription>
        </Alert>
      ) : null}
    </Box>
  )
}

export function AuthSubmit({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button type="submit" w="full" {...primaryButtonProps} {...props}>
      {children}
    </Button>
  )
}
