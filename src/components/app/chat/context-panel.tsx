"use client";

import { Icon } from "@/components/app/icons";
import type { ChatEvidence } from "./types";

interface ContextMeta {
  projects?: { id: string; label: string }[];
  entities?: { id: string; label: string; type: string }[];
  timelineEvents?: { id: string; label: string; at: string | null }[];
  intent?: string;
}

interface Props {
  meta: ContextMeta | null;
  evidence: ChatEvidence[];
}

export function ContextPanel({ meta, evidence }: Props) {
  return (
    <aside className="hidden w-80 shrink-0 border-l border-white/10 bg-obsidian/40 p-4 lg:block">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-soft-white">
        <Icon name="layers" size={16} className="text-violet-400" />
        Context
      </h3>
      <div className="space-y-5">
        <Section title="Memories used" icon="database">
          {evidence.length === 0 ? (
            <p className="text-xs text-slate-500">No memories cited yet.</p>
          ) : (
            <ul className="space-y-2">
              {evidence.slice(0, 6).map((e) => (
                <li key={e.id} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="truncate text-xs text-slate-200">{e.label}</div>
                  <div className="text-[11px] text-slate-500">{e.type}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Projects" icon="projects">
          {(meta?.projects?.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-500">No related projects.</p>
          ) : (
            <ul className="space-y-1">
              {meta!.projects!.slice(0, 5).map((p) => (
                <li key={p.id} className="text-xs text-slate-300">
                  {p.label}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Entities" icon="users">
          {(meta?.entities?.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-500">No related entities.</p>
          ) : (
            <ul className="space-y-1">
              {meta!.entities!.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span className="truncate">{e.label}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{e.type}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Timeline" icon="timeline">
          {(meta?.timelineEvents?.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-500">No timeline events.</p>
          ) : (
            <ul className="space-y-1.5">
              {meta!.timelineEvents!.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-violet-400/50" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-300">{t.label}</span>
                    {t.at && <span className="text-[11px] text-slate-500">{new Date(t.at).toLocaleDateString()}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, icon, children }: { title: string; icon: "database" | "projects" | "users" | "timeline"; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <Icon name={icon} size={12} /> {title}
      </div>
      {children}
    </div>
  );
}
