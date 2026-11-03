'use client';

/**
 * knowledge-graph-section.tsx — Interactive Knowledge Graph section.
 *
 * Loads the 3D graph client-side (ssr:false) inside a glass panel, with a
 * static CSS fallback when WebGL is unavailable.
 */

import dynamic from 'next/dynamic';
import { Suspense, useState, useSyncExternalStore } from 'react';

const KnowledgeGraph = dynamic(() => import('../three/knowledge-graph'), {
  ssr: false,
});

function supportsWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function StaticFallback() {
  return (
    <div className="kg-fallback" aria-hidden="true">
      <div className="kg-fallback-core" />
      <div className="kg-fallback-ring kg-fallback-ring1" />
      <div className="kg-fallback-ring kg-fallback-ring2" />
      <div className="kg-fallback-ring kg-fallback-ring3" />
    </div>
  );
}

export default function KnowledgeGraphSection() {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [webgl] = useState(() => supportsWebGL());

  return (
    <section id="knowledge-graph" className="kg-section" aria-labelledby="kg-title">
      <style>{`
        .kg-section { background: #0d0b1b; color: #e9e5fa; padding: 96px 24px; }
        .kg-inner { max-width: 1120px; margin: 0 auto; }
        .kg-head { text-align: center; max-width: 640px; margin: 0 auto 40px; }
        .kg-kicker { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.16em; color: #938bc4; }
        .kg-title { margin-top: 12px; font-size: clamp(1.9rem, 4.4vw, 3rem); line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
        .kg-sub { margin-top: 14px; color: #b0a9d6; font-size: 1.02rem; line-height: 1.6; }
        .kg-panel {
          position: relative; border-radius: 28px; overflow: hidden; height: min(70vw, 560px);
          background: rgba(255,255,255,0.02); border: 1px solid rgba(150,140,255,0.16);
          box-shadow: 0 24px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        }
        .kg-canvas-wrap { position: absolute; inset: 0; }
        .kg-instruction {
          position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
          font-size: 0.78rem; color: #8d86b8; letter-spacing: 0.04em; padding: 6px 14px;
          background: rgba(10,9,20,0.6); border: 1px solid rgba(150,140,255,0.14); border-radius: 999px;
          white-space: nowrap; pointer-events: none; z-index: 2;
        }
        .kg-fallback { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; }
        .kg-fallback-core {
          width: 180px; height: 180px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #b9a8ff, #6f5bd6 60%, #3d2f8f);
          box-shadow: 0 0 80px rgba(139,123,255,0.55);
        }
        .kg-fallback-ring {
          position: absolute; border: 1px solid rgba(160,150,255,0.25); border-radius: 50%;
          animation: kg-spin 24s linear infinite;
        }
        .kg-fallback-ring1 { width: 360px; height: 360px; }
        .kg-fallback-ring2 { width: 480px; height: 480px; animation-duration: 40s; animation-direction: reverse; }
        .kg-fallback-ring3 { width: 600px; height: 600px; animation-duration: 60s; }
        @keyframes kg-spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .kg-section { padding: 64px 16px; }
          .kg-panel { height: 420px; }
        }
      `}</style>

      <div className="kg-inner">
        <div className="kg-head">
          <p className="kg-kicker">Interactive knowledge graph</p>
          <h2 id="kg-title" className="kg-title">
            Your memory, visualized.
          </h2>
          <p className="kg-sub">
            See the threads between your projects, people, decisions and research — and discover what your AI already knows.
          </p>
        </div>

        <div className="kg-panel">
          <div className="kg-canvas-wrap" data-testid="knowledge-graph-canvas">
            {hydrated && webgl ? (
              <Suspense fallback={<StaticFallback />}>
                <KnowledgeGraph />
              </Suspense>
            ) : (
              <StaticFallback />
            )}
          </div>
          <div className="kg-instruction">Drag to rotate · Scroll to zoom · Click a node</div>
        </div>
      </div>
    </section>
  );
}
