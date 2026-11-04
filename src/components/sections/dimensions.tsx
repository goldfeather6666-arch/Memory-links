'use client'

/**
 * dimensions.tsx — Four Memory Dimensions section.
 *
 * Four visually distinct feature experiences, each with its own procedural
 * 3D visual and editorial copy, laid out asymmetrically (not a card grid).
 */

import dynamic from 'next/dynamic'
import { WebGLSafeScene } from '../three/webgl-scene'

const EpisodicTimeline = dynamic(() => import('../three/dimension-visuals').then((m) => m.EpisodicTimeline), {
  ssr: false,
})
const SemanticNodes = dynamic(() => import('../three/dimension-visuals').then((m) => m.SemanticNodes), {
  ssr: false,
})
const ProceduralPath = dynamic(() => import('../three/dimension-visuals').then((m) => m.ProceduralPath), {
  ssr: false,
})
const AssociativeGraph = dynamic(() => import('../three/dimension-visuals').then((m) => m.AssociativeGraph), {
  ssr: false,
})

const DIMS = [
  {
    V: EpisodicTimeline,
    n: '01',
    t: 'Episodic Memory',
    q: 'What happened, when it happened.',
    d: 'A cinematic timeline of the moments that shaped your work and life.',
  },
  {
    V: SemanticNodes,
    n: '02',
    t: 'Semantic Memory',
    q: 'What you know.',
    d: 'Structured knowledge nodes that build a living map of understanding.',
  },
  {
    V: ProceduralPath,
    n: '03',
    t: 'Procedural Memory',
    q: 'How you do things.',
    d: 'Workflow pathways preserve the how — your processes and methods.',
  },
  {
    V: AssociativeGraph,
    n: '04',
    t: 'Associative Memory',
    q: 'How everything connects.',
    d: 'Dynamic connections between projects, ideas, people and decisions.',
  },
]

export default function Dimensions() {
  return (
    <section id="dimensions" className="dm-section" aria-labelledby="dm-title">
      <style>{`
        .dm-section { background: #0a0914; color: #e9e5fa; padding: 104px 24px 48px; }
        .dm-inner { max-width: 1120px; margin: 0 auto; }
        .dm-head { max-width: 640px; margin-bottom: 56px; }
        .dm-kicker { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.16em; color: #938bc4; }
        .dm-title { margin-top: 12px; font-size: clamp(2rem, 4.6vw, 3.2rem); line-height: 1.08; font-weight: 700; letter-spacing: -0.02em; }
        .dm-title span { background: linear-gradient(120deg, #a78bfa, #7cc7ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .dm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; padding: 48px 0; border-top: 1px solid rgba(150,140,255,0.08); }
        .dm-row.reverse { direction: rtl; }
        .dm-row > * { direction: ltr; }
        .dm-visual { position: relative; height: min(52vw, 380px); border-radius: 24px; overflow: hidden; border: 1px solid rgba(150,140,255,0.12); background: #08070f; }
        .dm-num { font-size: 0.85rem; color: #7f79a8; letter-spacing: 0.2em; }
        .dm-t { margin-top: 10px; font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
        .dm-q { margin-top: 8px; font-size: 1.12rem; color: #c9c2ee; font-style: italic; }
        .dm-d { margin-top: 14px; color: #9c95c3; line-height: 1.65; font-size: 1rem; max-width: 40ch; }
        @media (max-width: 900px) {
          .dm-row { grid-template-columns: 1fr; gap: 24px; padding: 36px 0; }
          .dm-visual { height: 300px; }
        }
        @media (max-width: 640px) { .dm-section { padding: 72px 16px 32px; } .dm-visual { height: 260px; } }
      `}</style>

      <div className="dm-inner">
        <div className="dm-head">
          <p className="dm-kicker">Four memory dimensions</p>
          <h2 id="dm-title" className="dm-title">
            Memory is not one thing. <span>It is four.</span>
          </h2>
        </div>

        {DIMS.map((dim, i) => {
          const Visual = dim.V
          return (
            <div key={dim.n} className={`dm-row ${i % 2 === 1 ? 'reverse' : ''}`}>
              <div className="dm-visual">
              <WebGLSafeScene>
                <Visual />
              </WebGLSafeScene>
            </div>
              <div>
                <p className="dm-num">{dim.n}</p>
                <h3 className="dm-t">{dim.t}</h3>
                <p className="dm-q">{dim.q}</p>
                <p className="dm-d">{dim.d}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
