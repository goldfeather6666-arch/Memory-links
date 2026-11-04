"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/app/icons";
import { Button } from "@/components/ui/button";

const FOLLOW_UPS: Record<string, string[]> = {
  project_summary: ["What technologies were chosen?", "What's still unfinished?", "What changed from the original plan?"],
  historical: ["What happened after this?", "What was I working on before?"],
  temporal_comparison: ["What changed?", "Which version do I prefer now?"],
  relationship: ["Who else is related to this?", "How are these connected?"],
  procedure: ["What were the exact steps?", "What did I change about the process?"],
  preference: ["Any recent preference changes?", "What did I decide?"],
};

interface Props {
  busy: boolean;
  onSubmit: (text: string) => void;
  contextIntent?: string;
}

export function Composer({ busy, onSubmit, contextIntent }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const suggestions = contextIntent ? FOLLOW_UPS[contextIntent] ?? [] : [];

  return (
    <div className="shrink-0 border-t border-white/10 p-3">
      {suggestions.length > 0 && !busy && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSubmit(s)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-violet-400/40 hover:text-soft-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/5 p-2 focus-within:border-violet-400/40">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Ask about your past…"
          aria-label="Message"
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-soft-white outline-none placeholder:text-slate-500"
        />
        <Button variant={busy ? "ghost" : "primary"} size="sm" onClick={send} disabled={busy || !value.trim()}>
          {busy ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Working
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon name="arrow-right" size={15} /> Send
            </span>
          )}
        </Button>
      </div>
      <div className="mt-1.5 px-1 text-[11px] text-slate-500">
        Enter to send · Shift+Enter for a new line
      </div>
    </div>
  );
}
