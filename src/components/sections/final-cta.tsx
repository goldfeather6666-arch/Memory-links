'use client';

/**
 * final-cta.tsx — cinematic closing section.
 *
 * Light procedural "graduation" visual: floating glowing nodes converging on a
 * CSS radial glow. Renders the shared WaitlistForm at id="waitlist-form".
 */

import WaitlistForm from '@/components/waitlist-form';

const NODES = [
  { top: '18%', left: '22%', delay: '0s', size: 6 },
  { top: '30%', left: '72%', delay: '0.8s', size: 5 },
  { top: '64%', left: '18%', delay: '1.6s', size: 7 },
  { top: '70%', left: '70%', delay: '0.4s', size: 5 },
  { top: '42%', left: '46%', delay: '1.2s', size: 4 },
  { top: '22%', left: '55%', delay: '2s', size: 6 },
  { top: '78%', left: '45%', delay: '1.8s', size: 5 },
];

export default function FinalCta() {
  return (
    <section id="final-cta" className="fc-section" aria-labelledby="fc-title">
      <style>{`
        .fc-section {
          position: relative; background: radial-gradient(140% 120% at 50% 110%, #2a2157 0%, #131024 45%, #0a0916 100%);
          color: #f0edff; padding: 120px 24px 132px; text-align: center; overflow: hidden;
        }
        .fc-glow {
          position: absolute; left: 50%; top: 62%; width: 640px; height: 640px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(139,123,255,0.32) 0%, rgba(124,199,255,0.12) 34%, transparent 68%);
          filter: blur(6px); pointer-events: none;
        }
        .fc-node {
          position: absolute; border-radius: 50%;
          background: #cbbcff; box-shadow: 0 0 14px rgba(171,148,255,0.9);
          animation: fc-drift 6s ease-in-out infinite; pointer-events: none;
        }
        @keyframes fc-drift {
          0%, 100% { transform: translate(0,0) scale(1); opacity: 0.85; }
          50% { transform: translate(0, -14px) scale(1.25); opacity: 1; }
        }
        .fc-inner { position: relative; max-width: 720px; margin: 0 auto; }
        .fc-title { font-size: clamp(2.1rem, 5.6vw, 3.8rem); line-height: 1.05; font-weight: 800; letter-spacing: -0.025em; }
        .fc-title span { background: linear-gradient(120deg, #b49cff, #8fd0ff 55%, #e3c98d); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .fc-sub { margin-top: 22px; font-size: 1.15rem; color: #bfbadf; line-height: 1.6; max-width: 46ch; margin-inline: auto; }
        .fc-actions { margin-top: 36px; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
        .fc-primary {
          display: inline-block; padding: 14px 28px; border-radius: 999px;
          background: linear-gradient(120deg, #8b5cf6, #6d9dff); color: #fff; font-weight: 600;
          text-decoration: none; font-size: 1rem; border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 10px 36px rgba(120,100,255,0.35); transition: transform .2s, box-shadow .2s;
        }
        .fc-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 44px rgba(120,100,255,0.45); }
        .fc-secondary {
          display: inline-block; padding: 13px 26px; border-radius: 999px;
          background: rgba(255,255,255,0.04); color: #d9d4f5; font-weight: 600;
          text-decoration: none; font-size: 1rem; border: 1px solid rgba(150,140,255,0.25); transition: border-color .2s, background .2s;
        }
        .fc-secondary:hover { border-color: rgba(150,140,255,0.5); background: rgba(150,140,255,0.08); }
        .fc-form-wrap { margin-top: 48px; }
        @media (max-width: 640px) { .fc-section { padding: 84px 16px 96px; } }
      `}</style>

      <div className="fc-glow" aria-hidden="true" />
      {NODES.map((n, i) => (
        <span
          key={i}
          className="fc-node"
          aria-hidden="true"
          style={{
            width: n.size,
            height: n.size,
            top: n.top,
            left: n.left,
            animationDelay: n.delay,
          }}
        />
      ))}

      <div className="fc-inner">
        <h2 id="fc-title" className="fc-title">
          Stop starting over. <span>Start remembering.</span>
        </h2>
        <p className="fc-sub">
          Give your intelligence a memory that grows with you.
        </p>

        <div className="fc-actions">
          <a href="#waitlist-form" className="fc-primary">
            Join the early access list
          </a>
          <a href="#solution" className="fc-secondary">
            Explore the vision
          </a>
        </div>

        <div id="waitlist-form" className="fc-form-wrap">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
