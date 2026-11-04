'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion'
import { NebulaFallback, WebGLWrapper } from '../three/webgl-provider'

const MemoryUniverse = dynamic(() => import('../three/memory-universe'), { ssr: false })

const ACCENT = '#7fb0ff'
const TEXT = '#e9eefb'
const MUTED = '#9aa7c4'
const BG = '#050510'

/* Local fallback components (shared mirrors not yet present in this repo). */

function MagneticButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
}) {
  const ref = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }
    const el = ref.current
    if (!el) return undefined
    let raf = 0
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - (r.left + r.width / 2)
      const y = e.clientY - (r.top + r.height / 2)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate(${x * 0.22}px, ${y * 0.22}px)`
      })
    }
    const onLeave = () => {
      cancelAnimationFrame(raf)
      el.style.transform = ''
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [])

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.9rem 1.6rem',
    borderRadius: '999px',
    fontWeight: 600,
    fontSize: '0.98rem',
    textDecoration: 'none',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    willChange: 'transform',
  }

  const primary: React.CSSProperties = {
    ...base,
    background: `linear-gradient(135deg, #2a6bd4, #7c3aed)`,
    color: '#fff',
    boxShadow: '0 10px 34px -12px rgba(90,110,230,0.7)',
  }

  const secondary: React.CSSProperties = {
    ...base,
    background: 'rgba(255,255,255,0.04)',
    color: TEXT,
    border: '1px solid rgba(160,180,230,0.28)',
  }

  return (
    <a ref={ref} href={href} style={variant === 'primary' ? primary : secondary}>
      {children}
    </a>
  )
}

function IntroLoader() {
  const reducedMotion = useReducedMotion()
  const [done, setDone] = useState(() => reducedMotion)

  useEffect(() => {
    if (reducedMotion) return
    const t = setTimeout(() => setDone(true), 1800)
    return () => clearTimeout(t)
  }, [reducedMotion])

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          aria-hidden
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            display: 'grid',
            placeItems: 'center',
            background: BG,
          }}
        >
          <motion.div
            animate={{ opacity: [0.35, 1, 0.35], scale: [0.98, 1, 0.98] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ letterSpacing: '0.4em', fontSize: '0.8rem', color: ACCENT }}
          >
            MNEMOSYNE
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ScrollIndicator() {
  return (
    <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.72rem', letterSpacing: '0.3em', color: MUTED }}>SCROLL</span>
        <motion.div
          animate={{ y: [0, 10, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 1,
            height: 44,
            background: `linear-gradient(to bottom, ${ACCENT}, transparent)`,
          }}
        />
      </div>
    </div>
  )
}

const lineContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.18, delayChildren: 0.4 } },
}

const line = {
  hidden: { opacity: 0, y: 34, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function Hero() {
  const reducedMotion = useReducedMotion()

  return (
    <section
      id="hero"
      aria-label="Introduction"
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'clip',
        background: BG,
        color: TEXT,
        minHeight: '100svh',
        display: 'flex',
      }}
    >
      {/* Background: 3D universe or static nebula fallbacks */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {reducedMotion ? (
          <NebulaFallback />
        ) : (
          <WebGLWrapper fallback={<NebulaFallback />}>
            <Suspense fallback={<NebulaFallback />}>
              <MemoryUniverse />
            </Suspense>
          </WebGLWrapper>
        )}
      </div>

      {/* Content stack — readable above 3D */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 1160, margin: '0 auto', padding: 'clamp(110px, 18vh, 180px) 24px 140px' }}>
        <motion.div variants={lineContainer} initial="hidden" animate="show">
          <motion.p
            variants={line}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              color: ACCENT,
              fontSize: '0.82rem',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 12px ${ACCENT}` }} />
            Personal AI Memory Engine
          </motion.p>

          <motion.h1
            variants={line}
            style={{
              margin: '22px 0 0',
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 0.98,
              fontSize: 'clamp(2.9rem, 8.6vw, 7rem)',
              maxWidth: '13ch',
            }}
          >
            Your intelligence
            <br />
            <span style={{ background: `linear-gradient(100deg, ${ACCENT}, #c48cff)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              shouldn&rsquo;t start
            </span>
            <br />
            from zero.
          </motion.h1>

          <motion.p variants={line} style={{ marginTop: 26, maxWidth: '52ch', fontSize: 'clamp(1.02rem, 2vw, 1.22rem)', color: MUTED, lineHeight: 1.65 }}>
            Every conversation begins with everything you have already lived, learned, and felt. MNEMOSYNE
            carries your memory forward so your AI never asks you to meet it for the first time again.
          </motion.p>

          <motion.div variants={line} style={{ marginTop: 38, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <MagneticButton href="#solution">Explore the memory universe</MagneticButton>
            <MagneticButton href="#problem" variant="secondary">Discover how it works</MagneticButton>
          </motion.div>
        </motion.div>
      </div>

      <IntroLoader />
      <ScrollIndicator />
    </section>
  )
}
