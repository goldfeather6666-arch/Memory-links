'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const WebGLContext = createContext<boolean>(true)

/**
 * Hook that reports whether WebGL is available in the current browser.
 * Always true on the server / before the first mount.
 */
export function useWebGL(): boolean {
  return useContext(WebGLContext)
}

/** Probe for a WebGL context without leaving a live context behind. */
export function detectWebGL(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    )
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * Static CSS gradient nebula — used when WebGL is unavailable.
 * ------------------------------------------------------------------ */

export function NebulaFallback({ ariaHidden = true }: { ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden}
      data-testid="nebula-fallback"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: '#050510',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '-20%',
          background: [
            'radial-gradient(42% 42% at 18% 28%, rgba(64,96,214,0.55), transparent 70%)',
            'radial-gradient(50% 50% at 82% 22%, rgba(124,58,237,0.4), transparent 70%)',
            'radial-gradient(46% 46% at 72% 80%, rgba(34,211,238,0.28), transparent 72%)',
            'radial-gradient(38% 38% at 26% 74%, rgba(236,72,153,0.22), transparent 70%)',
            'radial-gradient(60% 60% at 50% 50%, rgba(9,9,26,0.9), transparent 78%)',
          ].join(','),
          filter: 'blur(2px)',
          animation: 'mnem-hero-drift 26s ease-in-out infinite alternate',
        }}
      />
      <style>{`
        @keyframes mnem-hero-drift {
          0% { transform: translate3d(-2%, -1%, 0) scale(1); }
          100% { transform: translate3d(2%, 1%, 0) scale(1.08); }
        }
      `}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * WebGLWrapper — renders children when WebGL is supported, otherwise the
 * static fallback. Re-measures after mount to avoid SSR mismatch.
 * ------------------------------------------------------------------ */

interface WebGLWrapperProps {
  children: ReactNode
  fallback?: ReactNode
}

export function WebGLWrapper({ children, fallback }: WebGLWrapperProps) {
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    // Probe asynchronously so the first (SSR-safe) render is not a false negative.
    const id = requestAnimationFrame(() => setSupported(detectWebGL()))
    return () => cancelAnimationFrame(id)
  }, [])

  const canRender = supported

  return (
    <WebGLContext.Provider value={canRender}>
      {canRender ? children : fallback ?? <NebulaFallback />}
    </WebGLContext.Provider>
  )
}

/** Convenience selector-style helper used by sections. */
export function useWebGLSupported(): boolean {
  return useWebGL()
}
