'use client'

/**
 * solution.tsx — The Solution section.
 *
 * Headline over the procedural KnowledgeUniverse (3D) scene with interactive
 * glass-labeled hotspots that reveal short explanations on hover.
 */

import dynamic from 'next/dynamic'
import { Html } from '@react-three/drei'

const KnowledgeUniverse = dynamic(() => import('../three/knowledge-universe'), {
  ssr: false,
})

interface Hotspot {
  p: [number, number, number]
  t: string
  b: string
}

const HOTSPOTS: Hotspot[] = [
  { p: [2.6, 0.5, 1.4], t: 'Projects', b: 'Project knowledge lives here.' },
  { p: [-2.6, -0.3, 1.2], t: 'Semantic', b: 'What you know, structured.' },
  { p: [0.3, 2.3, -1.2], t: 'Episodic', b: 'Moments along your timeline.' },
  { p: [-0.7, -2.2, -0.8], t: 'Associative', b: 'Links between ideas and people.' },
]

export default function Solution() {
  return (
    <section id="solution" className="so-section" aria-labelledby="so-title">
      <style>{`
        .so-section { background: #08070f; color: #e9e5fa; padding: 96px 24px; }
        .so-inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1.2fr; gap: 40px; align-items: center; }
        .so-kicker { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.16em; color: #938bc4; }
        .so-copy h2 { font-size: clamp(2rem, 4.6vw, 3.4rem); line-height: 1.05; font-weight: 700; letter-spacing: -0.02em; margin-top: 12px; }
        .so-copy h2 span { background: linear-gradient(120deg, #a78bfa, #7cc7ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .so-intro { margin-top: 18px; color: #b7b1dc; line-height: 1.65; font-size: 1.04rem; max-width: 46ch; }
        .so-visual { height: min(68vw, 560px); border-radius: 28px; overflow: hidden; border: 1px solid rgba(150,140,255,0.14); background: #070714; }
        .so-note { margin-top: 22px; font-size: 0.82rem; color: #7f79a8; }
        .so-hot {
          background: rgba(14,12,26,0.82); border: 1px solid rgba(167,139,250,0.35); border-radius: 12px;
          padding: 10px 14px; color: #eee9ff; max-width: 170px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); pointer-events: auto;
        }
        .so-hot-title { font-weight: 600; font-size: 0.9rem; }
        .so-hot-body { margin-top: 3px; font-size: 0.78rem; color: #aaa3d6; opacity: 0; transition: opacity .25s; }
        .so-hot:hover .so-hot-body { opacity: 1; }
        @media (max-width: 900px) {
          .so-inner { grid-template-columns: 1fr; }
          .so-visual { order: 2; height: 380px; }
          .so-copy { order: 1; }
        }
        @media (max-width: 640px) { .so-section { padding: 64px 16px; } .so-visual { height: 300px; } }
      `}</style>

      <div className="so-inner">
        <div className="so-copy">
          <p className="so-kicker">The Solution</p>
          <h2 id="so-title">
            One memory. <span>Infinite context.</span>
          </h2>
          <p className="so-intro">
            Instead of a fresh blank slate every session, MNEMOSYNE gives every AI a
            persistent, structured memory — projects, knowledge, timelines and
            associations all connected in one living universe.
          </p>
          <p className="so-note">Hover a node to explore.</p>
        </div>

        <div className="so-visual">
          <KnowledgeUniverse>
            {HOTSPOTS.map((h) => (
              <Html key={h.t} center position={h.p} zIndexRange={[10, 0]} distanceFactor={8}>
                <div className="so-hot">
                  <div className="so-hot-title">{h.t}</div>
                  <div className="so-hot-body">{h.b}</div>
                </div>
              </Html>
            ))}
          </KnowledgeUniverse>
        </div>
      </div>
    </section>
  )
}
