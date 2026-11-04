'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { detectWebGL } from './webgl-provider'

/**
 * A neutral static fallback shown when WebGL is unavailable. Mirrors the
 * hero's NebulaFallback visual language but is intentionally content-agnostic
 * so it can be reused across section canvases.
 */
export function StaticGlowFallback({ ariaHidden = true }: { ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden}
      data-testid="static-glow-fallback"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'radial-gradient(120% 120% at 50% 45%, #141330 0%, #0d0c1d 55%, #07060f 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '-15%',
          background: [
            'radial-gradient(38% 38% at 30% 30%, rgba(122,154,255,0.4), transparent 70%)',
            'radial-gradient(44% 44% at 72% 24%, rgba(139,123,255,0.34), transparent 70%)',
            'radial-gradient(40% 40% at 68% 78%, rgba(56,189,248,0.22), transparent 70%)',
            'radial-gradient(34% 34% at 24% 74%, rgba(167,139,250,0.24), transparent 70%)',
          ].join(','),
          filter: 'blur(3px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div
          style={{
            width: 'min(38%, 180px)',
            aspectRatio: '1',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #b9a8ff, #6f5bd6 60%, #3d2f8f)',
            boxShadow: '0 0 80px rgba(139,123,255,0.5)',
          }}
        />
      </div>
    </div>
  )
}

interface WebGLSafeSceneProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Renders a 3D scene only when WebGL is supported, otherwise shows a static
 * fallback. This prevents blank/black canvases on devices where WebGL is
 * unavailable or blocked.
 */
export function WebGLSafeScene({ children, fallback }: WebGLSafeSceneProps) {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setSupported(detectWebGL()))
    return () => cancelAnimationFrame(id)
  }, [])

  if (supported === true) return <>{children}</>
  return <>{fallback ?? <StaticGlowFallback />}</>
}
