'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Defers mounting its children until after the first paint (one animation
 * frame). R3F's <Canvas> creates its own React root via createRoot; when many
 * canvases mount during the same render commit — or remount as the inView /
 * frameloop state flips on scroll — React 19 can emit "Attempted to
 * synchronously unmount a root while React was already rendering". Mounting
 * each Canvas after first paint keeps R3F root creation outside the initial
 * render and avoids the race.
 */
export function CanvasMountGate({ children }: { children?: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  if (!mounted) return <div style={{ width: '100%', height: '100%' }} />

  return <>{children}</>
}
