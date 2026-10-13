import { isElement, walk, type HastNode } from './hast'

/**
 * rehype plugin (after rehype-pretty-code): drop its `data-theme` attributes.
 *
 * rehype-pretty-code marks the figure's <pre>, <code> and title with
 * `data-theme="github-dark-dimmed github-light"`. The site's colour mode
 * scopes Chakra's semantic tokens with `:root, [data-theme] { …light… }` and
 * `[data-theme=dark] …`, so any element carrying a different data-theme
 * resets every token to its LIGHT value: in dark mode a code block got the
 * light #f5f5f5 background and border under the dark-theme token colours —
 * light text on a light block. Nothing reads the attribute (the token colours
 * come from the --shiki-light / --shiki-dark variables, styles/globals.css),
 * so it is removed and code blocks follow the page's colour mode.
 */
export default function rehypeCodeThemeAttr() {
  return (tree: HastNode) => {
    walk(tree, (node) => {
      if (!isElement(node)) return
      delete node.properties['data-theme']
      delete node.properties.dataTheme
    })
  }
}
