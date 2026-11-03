'use client';

/**
 * privacy.tsx — Privacy section (quiet, premium editorial).
 *
 * Honest *design commitments* only — no unsupported claims about security
 * guarantees or certifications.
 */

const COMMITMENTS = [
  {
    title: 'Privacy-first architecture',
    body: 'Memory handling is designed around minimizing what leaves your control, with encryption and least-privilege access as defaults.',
  },
  {
    title: 'User-controlled memory',
    body: 'You decide what is remembered, what is shared, and what is forgotten — the system follows your choices.',
  },
  {
    title: 'Transparent memory sources',
    body: 'Every memory entry traces back to the source that produced it, so you always know where data came from.',
  },
  {
    title: 'Configurable retention',
    body: 'Set retention windows and deletion rules that fit your workflow; nothing lingers beyond what you allow.',
  },
  {
    title: 'Controlled integrations',
    body: 'External tools connect only with your explicit authorization, one at a time, never silently in the background.',
  },
  {
    title: 'Evidence-based retrieval',
    body: 'Answers cite the underlying memory and source, so the AI can be checked rather than trusted blindly.',
  },
];

export default function Privacy() {
  return (
    <section id="privacy" className="pv-section" aria-labelledby="pv-title">
      <style>{`
        .pv-section {
          background: #0e0c1c; color: #e7e3f7; padding: 104px 24px;
          border-top: 1px solid rgba(150,140,255,0.08);
        }
        .pv-inner { max-width: 960px; margin: 0 auto; }
        .pv-head { max-width: 520px; }
        .pv-kicker { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.18em; color: #7f79a8; }
        .pv-title { margin-top: 14px; font-size: clamp(1.9rem, 4.4vw, 3rem); line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
        .pv-lead { margin-top: 16px; color: #a9a2cf; font-size: 1.05rem; line-height: 1.7; }
        .pv-list { margin-top: 40px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
        .pv-item {
          background: rgba(255,255,255,0.025); border: 1px solid rgba(150,140,255,0.1);
          border-radius: 18px; padding: 20px 22px;
        }
        .pv-item-title { font-weight: 600; color: #eee9ff; }
        .pv-item-body { margin-top: 8px; font-size: 0.92rem; line-height: 1.6; color: #9c95c3; }
        .pv-disclaimer { margin-top: 36px; font-size: 0.82rem; color: #6f6998; border-left: 2px solid rgba(150,140,255,0.3); padding-left: 14px; }
        .pv-disclaimer strong { color: #a9a2cf; font-weight: 600; }
        @media (max-width: 640px) { .pv-section { padding: 72px 16px; } }
      `}</style>

      <div className="pv-inner">
        <div className="pv-head">
          <p className="pv-kicker">Privacy</p>
          <h2 id="pv-title" className="pv-title">
            Your memories. Your control.
          </h2>
          <p className="pv-lead">
            We are building memory the way it should work: yours first. These are
            the design commitments we hold ourselves to.
          </p>
        </div>

        <ul className="pv-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {COMMITMENTS.map((item) => (
            <li key={item.title} className="pv-item">
              <h3 className="pv-item-title" style={{ fontSize: '1rem', margin: 0 }}>
                {item.title}
              </h3>
              <p className="pv-item-body" style={{ marginTop: 8 }}>
                {item.body}
              </p>
            </li>
          ))}
        </ul>

        <p className="pv-disclaimer">
          <strong>Design commitments, not final policy.</strong> These describe our
          product direction. Exact data practices, retention and security controls
          will be spelled out in official privacy and security documentation before
          release.
        </p>
      </div>
    </section>
  );
}
