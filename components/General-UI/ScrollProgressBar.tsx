import React from 'react'
import { Box } from '@chakra-ui/react'
import { motion, useScroll, useSpring } from 'framer-motion'

export default function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 400, damping: 40 })

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      h="3px"
      zIndex={9999}
      pointerEvents="none"
    >
      <motion.div
        style={{
          height: '100%',
          background: 'linear-gradient(90deg, #dd6b20, #f59e0b, #0f766e)',
          transformOrigin: 'left',
          scaleX,
        }}
      />
    </Box>
  )
}
