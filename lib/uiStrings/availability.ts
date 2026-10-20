/**
 * The availability card's words (components/Contact/AvailabilityCard) — on
 * /contact, /about and the home page's contact band. English here, the
 * card's default; the Chinese words travel with the contact and home
 * tables (lib/uiStrings/contact, lib/uiStrings/home), shipped as props.
 * `{name}` marks a value filled in with fillUi.
 */
export type AvailabilityStrings = {
  open: string
  limited: string
  closed: string
  /** {date}: 'YYYY-MM'. */
  from: string
  workAuth: string
  roles: string
  bookCall: string
  newTab: string
}

export const AVAILABILITY_EN: AvailabilityStrings = {
  open: 'Available for new work',
  limited: 'Limited availability',
  closed: 'Not taking on new work',
  from: 'From {date}',
  workAuth: 'work authorisation',
  roles: 'Roles',
  bookCall: 'Book a call',
  newTab: ' (opens in a new tab)',
}
