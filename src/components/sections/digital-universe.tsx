'use client';

/**
 * digital-universe.tsx — Digital Universe section.
 *
 * Hero headline over the procedural data-streams scene, followed by a list of
 * source categories the engine is *intended* to connect (intended capabilities,
 * not claims). All visuals are procedural; styling is self-contained.
 */

import dynamic from 'next/dynamic';
import { WebGLSafeScene } from '../three/webgl-scene';

const DataStreams = dynamic(() => import('../three/data-streams'), {
  ssr: false,
  loading: () => null,
});

interface SourceItem {
  label: string;
  glyph: string;
  path: string;
}

const SOURCES: SourceItem[] = [
  { label: 'AI conversations', glyph: 'chat', path: 'M12 3a9 9 0 100 18h4.5l3 2.5V21A9 9 0 0012 3z' },
  { label: 'Documents', glyph: 'doc', path: 'M7 3h7l4 4v14H7V3z M14 3v5h5' },
  { label: 'Notes', glyph: 'note', path: 'M6 4h12a1 1 0 011 1v14a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z M9 9h6 M9 13h6 M9 17h4' },
  { label: 'Projects', glyph: 'project', path: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
  { label: 'Research', glyph: 'flask', path: 'M10 3h4 M11 3v5l-4 9a2 2 0 002 3h6a2 2 0 002-3l-4-9V3' },
  { label: 'Decisions', glyph: 'decision', path: 'M7 4l5 8-5 8M17 4l-5 8 5 8' },
  { label: 'Authorized external integrations', glyph: 'plug', path: 'M9 3v5 M15 3v5 M6 8h12v4a6 6 0 01-12 0V8z M12 18v3' },
];

function SourceIcon({ item }: { item: SourceItem }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={item.path} />
    </svg>
  );
}

export default function DigitalUniverse() {
  return (
    <section id="digital-universe" className="du-section" aria-labelledby="du-title">
      <style>{`
        .du-section {
          position: relative;
          background: radial-gradient(120% 90% at 50% -10%, #181430 0%, #0e0c1c 55%, #0a0914 100%);
          color: #edeaff;
          padding: 96px 24px 72px;
          overflow: hidden;
        }
        .du-inner { max-width: 1120px; margin: 0 auto; }
        .du-hero { position: relative; height: min(72vw, 520px); width: 100%; border-radius: 28px; overflow: hidden; border: 1px solid rgba(150,140,255,0.14); }
        .du-canvas-wrap { position: absolute; inset: 0; }
        .du-overlay {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          text-align: center; padding: 32px; pointer-events: none;
          background: linear-gradient(180deg, rgba(10,9,20,0.25) 0%, rgba(10,9,20,0) 40%, rgba(10,9,20,0.15) 100%);
        }
        .du-title {
          font-size: clamp(2rem, 5.4vw, 3.6rem); line-height: 1.05; font-weight: 700; letter-spacing: -0.02em;
          max-width: 15ch; margin: 0 auto; text-shadow: 0 2px 24px rgba(0,0,0,0.45);
        }
        .du-title span { background: linear-gradient(120deg, #a78bfa, #7cc7ff 60%, #e3c98d); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .du-sub { margin-top: 16px; font-size: 1.05rem; color: #bcb7e0; max-width: 46ch; margin-inline: auto; }
        .du-sources { margin-top: 56px; }
        .du-sources-head { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.14em; color: #9b94c9; margin-bottom: 20px; }
        .du-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
        .du-card {
          display: flex; align-items: center; gap: 14px; padding: 16px 18px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(150,140,255,0.12);
          border-radius: 16px; transition: border-color .25s, background .25s;
        }
        .du-card:hover { border-color: rgba(167,139,250,0.4); background: rgba(167,139,250,0.06); }
        .du-icon {
          display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; flex: none;
          background: linear-gradient(135deg, rgba(167,139,250,0.18), rgba(124,199,255,0.12));
          color: #c9bfff; border: 1px solid rgba(167,139,250,0.2);
        }
        .du-label { font-size: 0.98rem; font-weight: 600; color: #e6e2fa; }
        .du-note { margin-top: 22px; font-size: 0.82rem; color: #7f79a8; }
        @media (max-width: 640px) {
          .du-section { padding: 64px 16px 56px; }
          .du-hero { height: 340px; }
          .du-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="du-inner">
        <div className="du-hero">
          <div className="du-canvas-wrap">
            <WebGLSafeScene>
              <DataStreams />
            </WebGLSafeScene>
          </div>
          <div className="du-overlay">
            <div>
              <h2 id="du-title" className="du-title">
                Everything connected. <span>Nothing important forgotten.</span>
              </h2>
              <p className="du-sub">
                A living map of the knowledge your AI already touches — flowing into one coherent memory core.
              </p>
            </div>
          </div>
        </div>

        <div className="du-sources">
          <p className="du-sources-head">Designed to connect your sources</p>
          <ul className="du-grid" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {SOURCES.map((item) => (
              <li key={item.label} className="du-card">
                <span className="du-icon">
                  <SourceIcon item={item} />
                </span>
                <span className="du-label">{item.label}</span>
              </li>
            ))}
          </ul>
          <p className="du-note">
            Intended capabilities — integrations are authorized by you, one at a time.
          </p>
        </div>
      </div>
    </section>
  );
}
