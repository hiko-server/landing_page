import { Icon, type IconProps } from '@chakra-ui/react'

/** A key glyph (stroke icon, currentColor) for passkey actions. */
export function KeyIcon(props: IconProps) {
  return (
    <Icon
      viewBox="0 0 24 24"
      boxSize="1.05em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 20 3" />
      <path d="m16 7 3 3" />
      <path d="m14 9 2 2" />
    </Icon>
  )
}

/** A shield glyph for the security status. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon
      viewBox="0 0 24 24"
      boxSize="1.05em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  )
}
