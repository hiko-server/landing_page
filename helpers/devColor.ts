export const devColor = (color: string) => {
    const devMode = process.env.NEXT_PUBLIC_DEVMODE == 'true'
    return devMode ? color : 'transparent'
  }