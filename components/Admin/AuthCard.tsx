import React, { useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  useColorModeValue,
  type InputProps,
} from '@chakra-ui/react'
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons'

/**
 * Shared shell for the admin auth pages (login / forgot / reset): a single
 * centered card with the site's mono eyebrow + indigo accent, labelled
 * inputs and one primary action.
 */

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

export function AuthCard({
  eyebrow = 'Admin',
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
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const surface = useColorModeValue('rgba(255,255,255,0.85)', 'rgba(18,18,18,0.75)')
  const dim = useColorModeValue('gray.600', 'gray.400')
  return (
    <Flex align="center" justify="center" px={4} py={{ base: 10, md: 20 }} minH="70vh">
      <Box
        w="full"
        maxW="400px"
        border="1px solid"
        borderColor={border}
        bg={surface}
        backdropFilter="blur(12px)"
        borderRadius="xl"
        p={{ base: 6, md: 8 }}
        boxShadow="0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -12px rgba(0,0,0,0.18)"
      >
        <Text fontFamily={monoFont} fontSize="10px" letterSpacing="0.16em" textTransform="uppercase" color="var(--accent)">
          {eyebrow}
        </Text>
        <Heading as="h1" size="md" mt={2} letterSpacing="-0.01em">
          {title}
        </Heading>
        {subtitle ? (
          <Text mt={1.5} fontSize="13px" color={dim}>
            {subtitle}
          </Text>
        ) : null}
        <Box mt={6}>{children}</Box>
        {footer ? (
          <Box mt={5} pt={4} borderTop="1px solid" borderColor={border} fontSize="13px">
            {footer}
          </Box>
        ) : null}
      </Box>
    </Flex>
  )
}

export function AuthField({ label, ...props }: { label: string } & InputProps) {
  return (
    <FormControl isRequired={props.isRequired}>
      <FormLabel fontSize="12px" fontWeight={500} mb={1.5}>
        {label}
      </FormLabel>
      <Input size="md" fontSize="14px" focusBorderColor="var(--accent)" {...props} />
    </FormControl>
  )
}

export function PasswordField({ label, ...props }: { label: string } & InputProps) {
  const [show, setShow] = useState(false)
  return (
    <FormControl isRequired={props.isRequired}>
      <FormLabel fontSize="12px" fontWeight={500} mb={1.5}>
        {label}
      </FormLabel>
      <InputGroup>
        <Input size="md" fontSize="14px" pr="44px" focusBorderColor="var(--accent)" type={show ? 'text' : 'password'} {...props} />
        <InputRightElement>
          <IconButton
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            icon={show ? <ViewOffIcon /> : <ViewIcon />}
            size="sm"
            variant="ghost"
            onClick={() => setShow((v) => !v)}
            tabIndex={-1}
          />
        </InputRightElement>
      </InputGroup>
    </FormControl>
  )
}

export function AuthError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <Alert status="error" borderRadius="md" mb={4} fontSize="13px" role="alert">
      <AlertIcon />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

export function AuthSubmit({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="submit"
      w="full"
      bg="var(--accent)"
      color="white"
      _hover={{ opacity: 0.92 }}
      _active={{ opacity: 0.85 }}
      {...props}
    >
      {children}
    </Button>
  )
}
