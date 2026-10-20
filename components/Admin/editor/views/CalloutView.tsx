import React from 'react'
import { Button, Flex } from '@chakra-ui/react'
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { TbChevronDown } from 'react-icons/tb'
import { CALLOUT_TYPES, isCalloutType, type CalloutType } from '../../../../lib/rehype/calloutMarker'
import { COLOR, ICON, INK_LIGHT } from '../../../MDX/Callout'
import PopMenu, { type PopMenuItem } from '../PopMenu'
import { tabStop, useEditorUi } from './editorUi'

/**
 * A callout in the visual editor, drawn like the site's (components/MDX/
 * Callout): tinted panel, coloured rule, icon and label. The label is a
 * menu: Note, Tip, Important, Warning, Caution, or "Remove callout" (the
 * text stays, as plain blocks). The body is ordinary editable content.
 */

export const CALLOUT_LABEL: Record<CalloutType, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

const MENU_VARS = { '--callout-violet': '#6d28d9', '.chakra-ui-dark &, [data-theme="dark"] &': { '--callout-violet': '#c4b5fd' } }

export default function CalloutView({ node, editor, getPos, updateAttributes, selected, selectionInside }: NodeViewProps & { selectionInside?: boolean }) {
  const ui = useEditorUi()
  const type: CalloutType = isCalloutType(node.attrs.type) ? node.attrs.type : 'note'
  const Icon = ICON[type]

  const refocus = () => editor.commands.focus()

  const unwrap = () => {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (typeof pos !== 'number') return
    const { state, view } = editor
    const current = state.doc.nodeAt(pos)
    if (!current || current.type.name !== 'callout') return
    const tr = state.tr.replaceWith(pos, pos + current.nodeSize, current.content)
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size))))
    view.dispatch(tr.scrollIntoView())
    ui.announce('Callout removed; its text stays.')
  }

  const items: PopMenuItem[] = [
    ...CALLOUT_TYPES.map((t): PopMenuItem => {
      const TypeIcon = ICON[t]
      return {
        kind: 'radio',
        key: t,
        label: CALLOUT_LABEL[t],
        checked: t === type,
        icon: <TypeIcon size="sm" style={{ color: COLOR[t] }} />,
        onSelect: () => {
          if (t === type) return
          updateAttributes({ type: t })
          ui.announce(`Callout changed to ${CALLOUT_LABEL[t]}.`)
        },
      }
    }),
    { kind: 'divider', key: 'sep' },
    { kind: 'item', key: 'remove', label: 'Remove callout (keep the text)', onSelect: unwrap },
  ]

  return (
    <NodeViewWrapper
      className="tt-callout"
      data-callout={type}
      // The label colour per theme: editorStyles reads --callout-ink-light in light mode, the type colour in dark.
      style={{ '--callout-color': COLOR[type], '--callout-ink-light': INK_LIGHT[type] } as React.CSSProperties}
    >
      <Flex className="tt-callout-head" contentEditable={false} suppressContentEditableWarning align="center" mb={1} ml={-2} userSelect="none">
        <PopMenu
          label="Callout type"
          items={items}
          // The menu sits outside the callout: the violet of "Important" is defined for it too.
          listSx={MENU_VARS}
          restoreFocus={refocus}
          trigger={(props) => (
            <Button
              {...props}
              size="xs"
              variant="ghost"
              h="26px"
              px={2}
              gap={1.5}
              fontWeight={600}
              fontSize="13px"
              color="var(--callout-ink)"
              _hover={{ bg: 'color-mix(in srgb, var(--callout-color) 14%, transparent)' }}
              _active={{ bg: 'color-mix(in srgb, var(--callout-color) 18%, transparent)' }}
              leftIcon={<Icon size="sm" />}
              rightIcon={<TbChevronDown aria-hidden size={12} />}
              aria-label={`${CALLOUT_LABEL[type]} callout — change the type`}
              // Reachable with Tab while writing in the callout (or with it selected).
              tabIndex={tabStop(selected || !!selectionInside)}
            >
              {CALLOUT_LABEL[type]}
            </Button>
          )}
        />
      </Flex>
      <NodeViewContent className="tt-callout-body" />
    </NodeViewWrapper>
  )
}
