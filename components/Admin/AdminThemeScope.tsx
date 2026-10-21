import { useMemo, type ReactNode } from 'react'
import { Global, ThemeProvider as EmotionThemeProvider } from '@emotion/react'
import { useTheme } from '@chakra-ui/react'
import { ADMIN_COMPONENT_STYLES, ADMIN_GLOBAL_CSS, withAdminFieldContrast, withContrastSafeSolidButton } from '../../theme/adminComponents'

/**
 * The app theme plus the component styles only the admin uses (accordions,
 * tables, tabs, menus, tooltips…: theme/adminComponents.ts). pages/_app
 * renders every /admin route inside it and loads it — and those styles —
 * only there, so public pages never download them.
 *
 * It extends the already computed theme (CSS variables included) through
 * emotion's theme context, which is where Chakra's components read their
 * styles: the colour mode, CSS variables and global styles stay those of the
 * root provider. The admin's own CSS variables (the control border) are
 * added here as global styles, so public pages never carry them either.
 * Solid coloured buttons — only the admin has them — take the 600 shade in
 * light mode (white text ≥ 4.5:1; Chakra's 500 is 4.1:1 on red). Text
 * fields get a ≥ 3:1 boundary and ≥ 4.5:1 placeholders (the public
 * site's contact form keeps its own look).
 */
export default function AdminThemeScope({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const extended = useMemo(
    () => ({
      ...theme,
      components: {
        ...ADMIN_COMPONENT_STYLES,
        ...theme.components,
        Button: withContrastSafeSolidButton(theme.components.Button),
        Input: withAdminFieldContrast(theme.components.Input, true),
        Select: withAdminFieldContrast(theme.components.Select, true),
        Textarea: withAdminFieldContrast(theme.components.Textarea, false),
      },
    }),
    [theme],
  )
  return (
    <EmotionThemeProvider theme={extended}>
      <Global styles={ADMIN_GLOBAL_CSS} />
      {children}
    </EmotionThemeProvider>
  )
}
