import React from 'react'
import { Box } from '@chakra-ui/react'
import { HOME_LIMITS } from '../../../lib/homeShape'
import { PERSON_NAME } from '../../../lib/schema'
import type { SiteForm } from './homeForm'
import { TextField, type SectionProps } from './ImageCards'

/** Site-wide display name; empty keeps the built-in name. */
export default function SiteSection({ value, onChange }: SectionProps<SiteForm>) {
  const tooLong = value.name.trim().length > HOME_LIMITS.siteNameMax
  return (
    <Box maxW="480px">
      <TextField
        label="Site name"
        value={value.name}
        onChange={(v) => onChange((prev) => ({ ...prev, name: v }))}
        placeholder={PERSON_NAME}
        invalid={tooLong ? `Keep it under ${HOME_LIMITS.siteNameMax} characters.` : undefined}
        help={`The site's display name. Leave empty to use “${PERSON_NAME}”.`}
      />
    </Box>
  )
}
