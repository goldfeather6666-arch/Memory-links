'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Defers mounting its children until after the first paint, and staggers the
 * mount across animation frames per instance.
 *
 * R3F's <Canvas> creates its own React root via createRoot. When many canvases
 * mount during the same render commit — or remount as the inView / frameloop
 * state flips on scroll — React 19 can emit "Attempted to synchronously
 * unmount a root while React was already rendering". Mounting each Canvas
 * after first paint keeps R3F root creation outside the initial render, and
 * spreading the mounts across distinct frames avoids several roots being
 * created in a single commit (which happens on large viewports where many
 * 3D sections are in view at once).
 */
let gateSequence = 0

export function CanvasMountGate({ children }: { children?: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Each gate gets a per-instance offset (0-5) so canvases do not all reach
    // their mounted state in the same frame.
    const stagger = (gateSequence++ % 6) + 1
    let remaining = stagger
    let raf = 0
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) {
        setMounted(true)
      } else {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!mounted) return <div style={{ width: '100%', height: '100%' }} />

  return <>{children}</>
}
