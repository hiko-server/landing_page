import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Box, Button, Flex, Text, type BoxProps } from '@chakra-ui/react'
import { FileDownIcon } from '../Icons/ui/content'
import type { CvLang } from '../../lib/cvVisibility'
import { EXPORT_PATHS, cvFileName, type ExportFormat } from '../../lib/cvExport/files'

/**
 * Download controls of the CV page.
 *
 *   PdfLink       the real, server-rendered PDF (/cv.pdf, /cv/zh.pdf) as a
 *                 link with `download` and the dated file name — no print
 *                 dialog, on phones either.
 *   FormatsMenu   a disclosure button (aria-expanded / aria-controls) with
 *                 the other formats: plain text, JSON Resume, and printing
 *                 this page. Escape, a click outside or Tab-ing away close
 *                 it and Escape returns focus to the button; Arrow keys move
 *                 between the items. The list only exists while open, so it
 *                 adds nothing to the tab order or the accessibility tree
 *                 when closed. `placement="up"` opens above the button (the
 *                 phone action bar at the bottom of the screen).
 *
 * Interaction-only and tiny: no menu library, no positioning engine.
 */

const COPY = {
  en: {
    pdf: 'Download PDF',
    more: 'More formats',
    txt: 'Plain text',
    txtHint: '.txt · for paste-in application forms',
    json: 'JSON Resume',
    jsonHint: '.json · jsonresume.org schema',
    print: 'Print this page',
    printHint: 'A4, from your browser',
  },
  zh: {
    pdf: '下载 PDF',
    more: '更多格式',
    txt: '纯文本',
    txtHint: '.txt · 适合粘贴到网申表单',
    json: 'JSON Resume',
    jsonHint: '.json · jsonresume.org 格式',
    print: '打印本页',
    printHint: 'A4，使用浏览器打印',
  },
} as const

const mono = 'var(--font-geist-mono), monospace'

function fileOf(lang: CvLang, fileBase: string, format: ExportFormat) {
  return { href: EXPORT_PATHS[lang][format], download: cvFileName(fileBase, format) }
}

type PdfLinkProps = { lang: CvLang; fileBase: string } & Omit<React.ComponentProps<typeof Button>, 'as' | 'href'>

/** The PDF download as a button-styled link. */
export function PdfLink({ lang, fileBase, children, ...rest }: PdfLinkProps) {
  const f = fileOf(lang, fileBase, 'pdf')
  return (
    <Button as="a" href={f.href} download={f.download} {...rest}>
      {children ?? COPY[lang].pdf}
    </Button>
  )
}

export function PdfIcon(props: Pick<BoxProps, 'display' | 'mr'>) {
  return <Box as="span" display="inline-flex" aria-hidden {...props}>
    <FileDownIcon size="sm" />
  </Box>
}

export function FormatsMenu({
  lang,
  fileBase,
  onPrint,
  placement = 'down',
  trigger,
}: {
  lang: CvLang
  fileBase: string
  onPrint: () => void
  placement?: 'down' | 'up'
  /** Renders the toggle button; spread the given props onto it. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>
    'aria-expanded': boolean
    'aria-controls': string
    onClick: () => void
    onKeyDown: (e: React.KeyboardEvent) => void
  }) => React.ReactNode
}) {
  const T = COPY[lang]
  const [open, setOpen] = useState(false)
  const listId = `cv-formats-${useId().replace(/:/g, '')}`
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  const items = useCallback(() => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[data-format-item]') || []), [])
  const focusItem = useCallback(
    (index: number) => {
      const list = items()
      if (list.length) list[(index + list.length) % list.length].focus()
    },
    [items],
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      const last = e.key === 'ArrowUp'
      window.requestAnimationFrame(() => focusItem(last ? -1 : 0))
    }
  }
  const onListKey = (e: React.KeyboardEvent) => {
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(at + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(at - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(-1)
    }
  }

  const txt = fileOf(lang, fileBase, 'txt')
  const json = fileOf(lang, fileBase, 'json')
  const rows: Array<{ key: string; label: string; hint: string; href?: string; download?: string; onClick?: () => void }> = [
    { key: 'txt', label: T.txt, hint: T.txtHint, ...txt },
    { key: 'json', label: T.json, hint: T.jsonHint, ...json },
    {
      key: 'print',
      label: T.print,
      hint: T.printHint,
      onClick: () => {
        setOpen(false)
        onPrint()
      },
    },
  ]

  return (
    <Box
      ref={wrap}
      position="relative"
      onBlur={(e: React.FocusEvent) => {
        if (open && !wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      {trigger({
        ref: button,
        'aria-expanded': open,
        'aria-controls': listId,
        onClick: () => setOpen((o) => !o),
        onKeyDown: onTriggerKey,
      })}
      {open ? (
        <Box
          as="ul"
          id={listId}
          aria-label={T.more}
          listStyleType="none"
          m={0}
          p={1.5}
          position="absolute"
          right={0}
          {...(placement === 'up' ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 6px)' })}
          zIndex={30}
          minW="248px"
          maxW="calc(100vw - 32px)"
          bg="page.bg-elevated"
          border="1px solid"
          borderColor="page.border-strong"
          borderRadius="10px"
          boxShadow="0 12px 32px rgba(0, 0, 0, 0.18)"
          onKeyDown={onListKey}
          sx={{
            transformOrigin: placement === 'up' ? 'bottom right' : 'top right',
            animation: 'cvFormatsIn 140ms cubic-bezier(0.22, 1, 0.36, 1)',
            '@keyframes cvFormatsIn': { from: { opacity: 0, transform: 'translateY(-4px) scale(0.98)' }, to: { opacity: 1, transform: 'none' } },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          {rows.map((r) => (
            <Box as="li" key={r.key}>
              <Flex
                as={r.href ? 'a' : 'button'}
                data-format-item=""
                {...(r.href ? { href: r.href, download: r.download, onClick: () => setOpen(false) } : { type: 'button', onClick: r.onClick })}
                direction="column"
                align="flex-start"
                w="100%"
                minH="44px"
                px={3}
                py={2}
                borderRadius="6px"
                textAlign="left"
                color="page.fg"
                _hover={{ bg: 'page.hover', textDecoration: 'none' }}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '-2px', bg: 'page.hover' }}
              >
                <Text as="span" fontSize="14px" fontWeight={500} lineHeight="1.3">
                  {r.label}
                </Text>
                <Text as="span" fontFamily={mono} fontSize="11px" lineHeight="1.4" color="page.fg-subtle" mt={0.5}>
                  {r.hint}
                </Text>
              </Flex>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
