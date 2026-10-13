import { Extension, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'

/**
 * "/" command trigger for the visual editor (TipTap Suggestion).
 *
 * The extension only detects the trigger and forwards its lifecycle to a
 * bridge the React editor owns (it renders components/Admin/editor/
 * SlashMenu and runs the chosen command). Not offered inside code blocks or
 * inline code. "/" must start the text or follow a space, so URLs and
 * fractions never open the menu.
 */

export type SlashState = { range: Range; query: string; clientRect: (() => DOMRect | null) | null }

export type SlashBridge = {
  onOpen: (state: SlashState) => void
  onUpdate: (state: SlashState) => void
  onClose: () => void
  /** Keys while the menu is open; return true when handled. */
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const slashPluginKey = new PluginKey('slashCommand')

const toState = (p: SuggestionProps): SlashState => ({ range: p.range, query: p.query, clientRect: p.clientRect ?? null })

export function createSlashCommand(bridge: { current: SlashBridge | null }) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          pluginKey: slashPluginKey,
          char: '/',
          startOfLine: false,
          allowSpaces: false,
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from)
            if ($from.parent.type.name === 'codeBlock') return false
            return !$from.marks().some((m) => m.type.name === 'code')
          },
          items: () => [],
          render: () => ({
            onStart: (p) => bridge.current?.onOpen(toState(p)),
            onUpdate: (p) => bridge.current?.onUpdate(toState(p)),
            onExit: () => bridge.current?.onClose(),
            onKeyDown: ({ event }) => bridge.current?.onKeyDown(event) ?? false,
          }),
        }),
      ]
    },
  })
}
