import React, { useEffect, useRef } from 'react'
import { Box, useColorModeValue, usePrefersReducedMotion } from '@chakra-ui/react'

type Vec = { x: number; y: number; vx: number; vy: number }

export default function ParticlesBackground(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  const dot = useColorModeValue('rgba(49,130,206,0.55)', 'rgba(56,189,248,0.28)') // stronger in light
  const line = useColorModeValue('rgba(66,153,225,0.35)', 'rgba(125,211,252,0.22)') // base, alpha adjusted below
  const lineAlphaScale = useColorModeValue(0.5, 0.3)
  const dotRadius = useColorModeValue(2.0, 1.6)
  const strokeWidth = useColorModeValue(1.2, 1.0)
  const maxDistFactor = useColorModeValue(0.14, 0.12)

  useEffect(() => {
    if (prefersReducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const cvs = canvas as HTMLCanvasElement

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = ctx as CanvasRenderingContext2D

    let animId = 0
    let running = true
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    const particles: Vec[] = []

    function resize() {
      const { innerWidth: w, innerHeight: h } = window
      cvs.width = Math.floor(w * dpr)
      cvs.height = Math.floor(h * dpr)
      cvs.style.width = w + 'px'
      cvs.style.height = h + 'px'
    }

    function initParticles() {
      particles.length = 0
      const w = cvs.width / dpr
      const h = cvs.height / dpr
      // Density tuned for perf; fewer on small screens
      const baseCount = Math.floor((w * h) * 0.00006) // ~40 on 1080p
      const count = Math.max(20, Math.min(80, baseCount))
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
        })
      }
    }

    function step() {
      if (!running) return
      const w = cvs.width
      const h = cvs.height
      // clear with slight trail fade for softness
      g.save()
      g.fillStyle = 'rgba(0,0,0,0)'
      g.clearRect(0, 0, w, h)
      g.restore()

      const wCSS = w / dpr
      const hCSS = h / dpr

      // move
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > wCSS) p.vx *= -1
        if (p.y < 0 || p.y > hCSS) p.vy *= -1
      }

      // draw connections
      const maxDist = Math.min(wCSS, hCSS) * maxDistFactor // connect when close
      const maxDist2 = maxDist * maxDist
      g.save()
      g.scale(dpr, dpr)
      g.lineWidth = strokeWidth
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        // dot
        g.beginPath()
        g.fillStyle = dot
        g.arc(p.x, p.y, dotRadius, 0, Math.PI * 2)
        g.fill()

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dx = p.x - q.x
          const dy = p.y - q.y
          const d2 = dx * dx + dy * dy
          if (d2 < maxDist2) {
            const a = 1 - d2 / maxDist2
            const alpha = lineAlphaScale * a
            g.strokeStyle = line.replace(/0\.[0-9]+\)/, `${alpha.toFixed(2)})`)
            g.beginPath()
            g.moveTo(p.x, p.y)
            g.lineTo(q.x, q.y)
            g.stroke()
          }
        }
      }
      g.restore()

      animId = requestAnimationFrame(step)
    }

    function onResize() {
      resize()
      initParticles()
    }

    resize()
    initParticles()
    step()
    window.addEventListener('resize', onResize)
    return () => {
      running = false
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [
    prefersReducedMotion,
    dot,
    dotRadius,
    line,
    lineAlphaScale,
    maxDistFactor,
    strokeWidth,
  ])

  return (
    <Box position="fixed" inset={0} zIndex={0} pointerEvents="none" aria-hidden>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </Box>
  )
}
