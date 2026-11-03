'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const ACCENT = '#8ab4ff'
const TEXT = '#e9eefb'
const MUTED = '#9aa7c4'
const BG = '#050510'

interface Chip {
  label: string
  start: { l: number; t: number }
  end: { l: number; t: number }
}

/** Deterministic scatter → converge layout. */
function buildChips(): Chip[] {
  const seed = 5
  const rand = () => {
    let s = seed * 16807 % 2147483647
    return () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  }
  const r = rand()
  const labels = [
    'Where did we leave off?',
    'Context lost',
    'New tab',
    'Who are you again?',
    'Remind me',
    'Wasted memory',
    'No thread',
    'Starting over',
    'Again?',
    'Re-learning',
    'Same question',
    'Cold start',
  ]
  // Target positions orbit the core at the centre.
  return labels.map((label, i) => {
    const angle = (i / labels.length) * Math.PI * 2
    return {
      label,
      start: { l: 4 + r() * 88, t: 6 + r() * 78 },
      end: { l: 50 + Math.cos(angle) * 22, t: 50 + Math.sin(angle) * 22 },
    }
  })
}

const CHIPS = buildChips()

export default function Problem() {
  const sectionRef = useRef<HTMLElement>(null)
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([])
  const coreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 65%',
          end: 'center 45%',
          scrub: 0.6,
          onEnter: () => {
            tl.timeScale(1)
          },
        },
      })

      chipRefs.current.forEach((el, i) => {
        if (!el) return
        const chip = CHIPS[i]
        tl.fromTo(
          el,
          { left: `${chip.start.l}%`, top: `${chip.start.t}%`, opacity: 0, scale: 0.6 },
          { left: `${chip.end.l}%`, top: `${chip.end.t}%`, opacity: 1, scale: 1, ease: 'power2.inOut', duration: 1 },
          i * 0.06,
        )
      })

      tl.fromTo(
        coreRef.current,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, ease: 'back.out(1.6)', duration: 0.6 },
        labels.length * 0.06 + 0.2,
      )
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="problem"
      aria-label="The problem"
      style={{
        position: 'relative',
        background: BG,
        color: TEXT,
        overflow: 'hidden',
        minHeight: '110svh',
        padding: 'clamp(90px, 12vh, 140px) 24px 120px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* header */}
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 720 }}>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          style={{ color: ACCENT, letterSpacing: '0.3em', fontSize: '0.82rem', textTransform: 'uppercase' }}
        >
          The Problem
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, delay: 0.1 }}
          style={{
            margin: '16px 0 18px',
            fontSize: 'clamp(2.2rem, 6vw, 4.4rem)',
            lineHeight: 1.0,
            letterSpacing: '-0.03em',
            fontWeight: 800,
          }}
        >
          Every conversation.
          <br />
          <span style={{ color: MUTED }}>Another lost beginning.</span>
        </motion.h2>
      </div>

      {/* fragment stage */}
      <div style={{ position: 'relative', flex: 1, minHeight: 420, marginTop: 24 }}>
        <div
          ref={coreRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 120,
            height: 120,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle at 50% 45%, rgba(138,164,255,0.85), rgba(124,58,237,0.35) 55%, transparent 72%)`,
            boxShadow: `0 0 80px 20px rgba(90,110,230,0.4)`,
            opacity: 0,
          }}
        />
        {CHIPS.map((chip, i) => (
          <span
            key={chip.label}
            ref={(el) => {
              chipRefs.current[i] = el
            }}
            style={{
              position: 'absolute',
              left: `${chip.start.l}%`,
              top: `${chip.start.t}%`,
              transform: 'translate(-50%, -50%)',
              padding: '0.6rem 1rem',
              borderRadius: 14,
              background: 'rgba(20,26,46,0.7)',
              border: '1px solid rgba(138,164,255,0.28)',
              fontSize: '0.86rem',
              color: TEXT,
              whiteSpace: 'nowrap',
              boxShadow: '0 10px 30px -14px rgba(0,0,0,0.7)',
              opacity: 0,
            }}
          >
            {chip.label}
          </span>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.3 }}
        style={{ maxWidth: '52ch', color: MUTED, lineHeight: 1.7, marginTop: 8 }}
      >
        Each new chat resets the slate. Context evaporates between tabs, replies, and sessions — so your AI
        is always meeting you for the first time, and the real conversation never gets the chance to begin.
      </motion.p>
    </section>
  )
}
