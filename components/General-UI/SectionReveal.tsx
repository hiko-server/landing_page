import React from 'react'
import { Box, BoxProps } from '@chakra-ui/react'
import { motion } from 'framer-motion'

const MotionBox = motion(Box)

type Props = BoxProps & { children: React.ReactNode }

export default function SectionReveal({ children, ...rest }: Props) {
  return (
    <MotionBox
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      {...rest}
    >
      {children}
    </MotionBox>
  )
}

