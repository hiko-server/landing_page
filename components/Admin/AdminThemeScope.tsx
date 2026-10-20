import { useMemo, type ReactNode } from 'react'
import { Global, ThemeProvider as EmotionThemeProvider } from '@emotion/react'
import { useTheme } from '@chakra-ui/react'
import { ADMIN_COMPONENT_STYLES, ADMIN_GLOBAL_CSS } from '../../theme/adminComponents'

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
 */
export default function AdminThemeScope({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const extended = useMemo(() => ({ ...theme, components: { ...ADMIN_COMPONENT_STYLES, ...theme.components } }), [theme])
  return (
    <EmotionThemeProvider theme={extended}>
      <Global styles={ADMIN_GLOBAL_CSS} />
      {children}
    </EmotionThemeProvider>
  )
}
