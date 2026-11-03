'use client';

/**
 * footer.tsx — minimal, elegant footer.
 *
 * Brand, philosophy, section anchors, and clearly-marked placeholder links for
 * legal pages and social profiles (not real destinations).
 */

const NAV_ANCHORS = [
  { href: '#digital-universe', label: 'Digital universe' },
  { href: '#agent-memory', label: 'Universal agent' },
  { href: '#knowledge-graph', label: 'Knowledge graph' },
  { href: '#privacy', label: 'Privacy' },
];

const LEGAL_PLACEHOLDERS = [
  { label: 'Privacy', href: '#privacy' },
  { label: 'Terms', href: '#terms-placeholder' },
  { label: 'Contact', href: '#contact-placeholder' },
];

const SOCIAL_PLACEHOLDERS = [
  { label: 'X', shortLabel: 'X' },
  { label: 'LinkedIn', shortLabel: 'in' },
  { label: 'GitHub', shortLabel: 'GH' },
];

export default function Footer() {
  return (
    <footer id="footer" className="ft-footer" aria-label="Site footer">
      <style>{`
        .ft-footer {
          background: #08070f; color: #a79fc8; padding: 64px 24px 36px;
          border-top: 1px solid rgba(150,140,255,0.08);
        }
        .ft-inner { max-width: 1120px; margin: 0 auto; }
        .ft-top { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 40px; }
        .ft-brand { display: flex; align-items: center; gap: 12px; }
        .ft-mark {
          width: 34px; height: 34px; border-radius: 10px; flex: none;
          background: linear-gradient(135deg, #8b5cf6, #6d9dff);
          display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 16px;
        }
        .ft-name { font-weight: 700; color: #f0edff; font-size: 1.05rem; letter-spacing: 0.01em; }
        .ft-tag { font-size: 0.82rem; color: #8d86b8; margin-top: 2px; }
        .ft-philosophy { margin-top: 18px; font-size: 0.92rem; line-height: 1.7; color: #9a93bf; max-width: 42ch; }
        .ft-col-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.14em; color: #7f79a8; margin-bottom: 14px; }
        .ft-nav { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
        .ft-nav a { color: #b6afe0; text-decoration: none; font-size: 0.95rem; transition: color .2s; }
        .ft-nav a:hover { color: #fff; }
        .ft-placeholder { color: #8d86b8; text-decoration: none; border-bottom: 1px dashed rgba(150,140,255,0.35); font-size: 0.95rem; cursor: not-allowed; }
        .ft-social { display: flex; gap: 10px; }
        .ft-social-btn {
          width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(150,140,255,0.16);
          color: #b6afe0; font-size: 0.8rem; font-weight: 700; cursor: not-allowed; 
        }
        .ft-note { margin-top: 12px; font-size: 0.78rem; color: #6f6998; }
        .ft-bottom { margin-top: 48px; padding-top: 22px; border-top: 1px solid rgba(150,140,255,0.08); font-size: 0.82rem; color: #6f6998; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        @media (max-width: 760px) {
          .ft-top { grid-template-columns: 1fr; gap: 32px; }
          .ft-bottom { flex-direction: column; }
        }
      `}</style>

      <div className="ft-inner">
        <div className="ft-top">
          <div>
            <div className="ft-brand">
              <span className="ft-mark" aria-hidden="true">M</span>
              <span>
                <div className="ft-name">MNEMOSYNE</div>
                <div className="ft-tag">Personal AI Memory Engine</div>
              </span>
            </div>
            <p className="ft-philosophy">
              A memory your AI can carry across every tool and model — continuous,
              yours, and built on the belief that nothing important should be forgotten.
            </p>
          </div>

          <nav aria-label="Section navigation">
            <div className="ft-col-title">Explore</div>
            <ul className="ft-nav">
              {NAV_ANCHORS.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <div className="ft-col-title">Company</div>
            <ul className="ft-nav">
              {LEGAL_PLACEHOLDERS.map((item) => (
                <li key={item.label}>
                  <a
                    className="ft-placeholder"
                    href={item.href}
                    aria-disabled="true"
                    title="Placeholder — not yet linked"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="ft-col-title" style={{ marginTop: 24 }}>Follow</div>
            <div className="ft-social">
              {SOCIAL_PLACEHOLDERS.map((item) => (
                <span
                  key={item.label}
                  className="ft-social-btn"
                  role="button"
                  aria-label={`${item.label} (placeholder)`}
                  tabIndex={-1}
                  title={`${item.label} placeholder — not a real destination`}
                >
                  {item.shortLabel}
                </span>
              ))}
            </div>
            <p className="ft-note">Social profiles are placeholders for now.</p>
          </div>
        </div>

        <div className="ft-bottom">
          <span>© {new Date().getFullYear()} MNEMOSYNE. All rights reserved.</span>
          <span>Made for a memory that grows with you.</span>
        </div>
      </div>
    </footer>
  );
}
