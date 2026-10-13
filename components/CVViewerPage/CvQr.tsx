import React from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'

/**
 * Print-only footer of the A4 sheet: an 18 mm QR code linking to the live CV
 * (lib/qr.ts `qrSvg`, rendered on the server) and a one-line caption, so a
 * printed or PDF copy leads back to the current version. Hidden on screen,
 * drawn in the sheet's ink colour (`currentColor`), kept on one page with
 * its caption.
 */
export default function CvQr({
  svg,
  caption,
  label,
}: {
  svg: string
  caption: string
  label: string
}) {
  return (
    <Flex
      as="footer"
      className="cv-print-qr"
      align="center"
      justify="flex-end"
      gap="3mm"
      px="10px"
      pt="2mm"
      color="#111"
      sx={{
        '@media screen': { display: 'none' },
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <Text fontSize="10px" lineHeight="1.4" color="#4a4a4a" textAlign="right">
        {caption}
      </Text>
      <Box
        role="img"
        aria-label={label}
        w="18mm"
        h="18mm"
        flexShrink={0}
        sx={{ '& svg': { display: 'block', width: '100%', height: '100%' } }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </Flex>
  )
}
