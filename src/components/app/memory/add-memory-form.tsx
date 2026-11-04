"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getIngestionStatusAction,
  ingestMemoryAction,
} from "@/server/memory/actions";

interface AddMemoryFormProps {
  workspaces: { id: string; name: string }[];
  defaultWorkspaceId?: string;
}

const SOURCE_TYPES = ["text", "note", "markdown", "txt", "conversation", "api"] as const;

export function AddMemoryForm({ workspaces, defaultWorkspaceId }: AddMemoryFormProps) {
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId ?? workspaces[0]?.id ?? "");
  const [sourceType, setSourceType] = useState("text");
  const [sourceId, setSourceId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; id?: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    try {
      const out = await ingestMemoryAction({
        workspaceId,
        sourceType: sourceType as (typeof SOURCE_TYPES)[number],
        sourceId: sourceId.trim() ? sourceId.trim() : undefined,
        title: title.trim() ? title.trim() : undefined,
        content,
      });
      if (out.ok && out.id) {
        const status = await getIngestionStatusAction(out.id);
        const message = status.ok
          ? `Saved — ingestion ${status.status}. Processing is queued; extraction runs when an AI provider is configured.`
          : "Saved — processing queued.";
        setResult({ ok: true, message, id: out.id });
        setContent("");
      } else {
        setResult({ ok: false, message: out.error ?? "Could not save memory." });
      }
    } finally {
      setPending(false);
    }
  }

  const selectCls =
    "h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-4 text-sm text-soft-white focus:border-violet focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate">
          Workspace
          <select
            className={`${selectCls} mt-1`}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            required
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-slate">
          Source type
          <select
            className={`${selectCls} mt-1`}
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate">
          Source identifier (optional)
          <Input
            className="mt-1"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="e.g. notes/2024-idea.md"
          />
        </label>
        <label className="block text-sm text-slate">
          Title (optional)
          <Input
            className="mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
          />
        </label>
      </div>

      <label className="block text-sm text-slate">
        Content
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={8}
          placeholder="Paste or type the text you want to remember…"
          className="mt-1 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-4 py-3 text-sm text-soft-white placeholder:text-slate focus:border-violet focus:outline-none"
        />
      </label>

      {result && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
          role="status"
        >
          {result.message}
        </div>
      )}

      <Button type="submit" loading={pending}>
        {pending ? "Saving…" : "Save to memory"}
      </Button>
    </form>
  );
}
