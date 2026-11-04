'use client';

/**
 * universal-agent.tsx — Universal Agent section (id="agent-memory").
 *
 * Headline + interoperability/model-independence copy alongside the
 * agent-memory procedural scene.
 */

import dynamic from 'next/dynamic';
import { WebGLSafeScene } from '../three/webgl-scene';

const AgentMemory = dynamic(() => import('../three/agent-memory'), {
  ssr: false,
  loading: () => null,
});

const PRINCIPLES = [
  {
    title: 'Model independent',
    body: 'Works across models and providers — a shared memory layer, not a locked-in tool.',
  },
  {
    title: 'Interoperable',
    body: 'Your data stays portable and structured so different agents can read and write it safely.',
  },
  {
    title: 'One intelligence',
    body: 'Code, research, browser and creative agents all draw from the same memory core.',
  },
];

export default function UniversalAgent() {
  return (
    <section id="agent-memory" className="ua-section" aria-labelledby="ua-title">
      <style>{`
        .ua-section {
          background: #0b0917; color: #e9e5fa; padding: 88px 24px; position: relative; overflow: hidden;
        }
        .ua-inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
        .ua-visual { position: relative; height: min(64vw, 520px); border-radius: 28px; overflow: hidden; border: 1px solid rgba(150,140,255,0.14); order: 2; }
        .ua-copy { order: 1; }
        .ua-kicker { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.16em; color: #938bc4; }
        .ua-title { margin-top: 12px; font-size: clamp(1.9rem, 4.4vw, 3.1rem); line-height: 1.08; font-weight: 700; letter-spacing: -0.02em; }
        .ua-title span { background: linear-gradient(120deg, #a78bfa, #7cc7ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .ua-intro { margin-top: 18px; color: #b7b1dc; font-size: 1.05rem; line-height: 1.6; max-width: 48ch; }
        .ua-list { margin-top: 28px; display: grid; gap: 14px; }
        .ua-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(150,140,255,0.12); border-radius: 14px; padding: 16px 18px; }
        .ua-item-title { font-weight: 600; color: #eee9ff; }
        .ua-item-body { margin-top: 4px; font-size: 0.92rem; color: #a49ecb; }
        @media (max-width: 900px) {
          .ua-inner { grid-template-columns: 1fr; gap: 32px; }
          .ua-visual { order: 1; height: 380px; }
          .ua-copy { order: 2; }
        }
        @media (max-width: 640px) { .ua-section { padding: 64px 16px; } .ua-visual { height: 300px; } }
      `}</style>

      <div className="ua-inner">
        <div className="ua-visual">
          <WebGLSafeScene>
            <AgentMemory />
          </WebGLSafeScene>
        </div>
        <div className="ua-copy">
          <p className="ua-kicker">Universal agent</p>
          <h2 id="ua-title" className="ua-title">
            Every AI. <span>One shared intelligence.</span>
          </h2>
          <p className="ua-intro">
            Rather than siloed memory per tool, MNEMOSYNE gives your whole AI
            ecosystem a single, continuous memory — so each agent builds on
            what the others already know.
          </p>
          <div className="ua-list">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="ua-item">
                <div className="ua-item-title">{p.title}</div>
                <div className="ua-item-body">{p.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
