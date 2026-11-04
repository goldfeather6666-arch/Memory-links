"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveMemoryAction,
  deleteMemoryAction,
  reviewMemoryAction,
  unarchiveMemoryAction,
  updateMemoryAction,
} from "@/server/memory/actions";

interface DetailActionsProps {
  memoryId: string;
  state: string;
  initialContent: string;
  initialSummary: string | null;
  initialType: string;
  initialConfidence: number | null;
}

const MEMORY_TYPES = ["episodic", "semantic", "procedural", "associative"] as const;

export function DetailActions({
  memoryId,
  state,
  initialContent,
  initialSummary,
  initialType,
  initialConfidence,
}: DetailActionsProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [content, setContent] = useState(initialContent);
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [type, setType] = useState(initialType);
  const [confidence, setConfidence] = useState(String(initialConfidence ?? ""));

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setMessage(null);
    try {
      const out = await fn();
      setMessage(out.ok ? { ok: true, text: "Done." } : { ok: false, text: out.error ?? "Action failed." });
      if (out.ok) setEditing(false);
    } finally {
      setPending(false);
    }
  }

  async function saveEdit() {
    await run(() =>
      updateMemoryAction({
        memoryId,
        content,
        summary: summary.trim() ? summary : null,
        memoryType: type as (typeof MEMORY_TYPES)[number],
        confidence: confidence !== "" && Number.isFinite(Number(confidence)) ? Number(confidence) : null,
        changeReason: "user_edit",
      }),
    );
  }

  const selectCls =
    "h-11 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-4 text-sm text-soft-white focus:border-violet focus:outline-none";

  return (
    <div className="space-y-3">
      {editing && (
        <div className="space-y-3 rounded-2xl border border-soft-white/10 p-4">
          <label className="block text-sm text-slate">
            Content
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-xl border border-soft-white/15 bg-midnight/60 px-4 py-3 text-sm text-soft-white focus:border-violet focus:outline-none"
            />
          </label>
          <label className="block text-sm text-slate">
            Summary
            <Input className="mt-1" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate">
              Type
              <select className={`${selectCls} mt-1`} value={type} onChange={(e) => setType(e.target.value)}>
                {MEMORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate">
              Confidence (0–1)
              <Input
                className="mt-1"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                inputMode="decimal"
                placeholder="0.8"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveEdit} loading={pending}>
              Save changes
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {state === "needs_review" && (
            <>
              <Button type="button" size="sm" onClick={() => run(() => reviewMemoryAction(memoryId, true))} loading={pending}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => run(() => reviewMemoryAction(memoryId, false))} loading={pending}>
                Reject
              </Button>
            </>
          )}
          {state === "archived" ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => run(() => unarchiveMemoryAction(memoryId))} loading={pending}>
              Restore
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={() => run(() => archiveMemoryAction(memoryId))} loading={pending}>
              Archive
            </Button>
          )}
          {!confirmDelete ? (
            <Button type="button" size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" variant="danger" onClick={() => run(() => deleteMemoryAction(memoryId))} loading={pending}>
                Confirm delete
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
