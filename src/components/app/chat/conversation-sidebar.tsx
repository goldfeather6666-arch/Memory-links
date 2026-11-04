"use client";

import { useState } from "react";
import { Icon } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import type { ChatConversation } from "./types";

interface Props {
  conversations: ChatConversation[];
  activeId: string | null;
  workspaceId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: () => void;
}

export function ConversationSidebar({ conversations, activeId, onSelect, onNew, onDeleted, workspaceId }: Props) {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const filtered = conversations.filter((c) => {
    const matchesQ = !q.trim() || c.title.toLowerCase().includes(q.toLowerCase());
    const matchesStatus = showArchived ? c.status === "archived" : c.status === "active";
    return matchesQ && matchesStatus;
  });

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this conversation and its messages?")) return;
    await fetch(`/api/v1/conversations/${id}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <span className="text-sm font-semibold text-soft-white">Conversations</span>
        <Button variant="ghost" size="sm" onClick={onNew}>
          <Icon name="plus" size={16} />
        </Button>
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
          <Icon name="search" size={15} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-sm text-soft-white outline-none placeholder:text-slate-500"
            aria-label="Search conversations"
          />
        </div>
        <button
          className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-soft-white"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Icon name="layers" size={14} />
          {showArchived ? "Showing archived" : "Show archived"}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No conversations yet.
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition ${
              c.id === activeId ? "bg-violet-500/15 text-soft-white" : "hover:bg-white/5 text-slate-300"
            }`}
          >
            <Icon name="chat" size={15} className="shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{c.title}</div>
              <div className="truncate text-[11px] text-slate-500">
                {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString() : "No messages"}
              </div>
            </div>
            <button
              onClick={(e) => void remove(e, c.id)}
              className="rounded p-1 text-slate-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
              aria-label={`Delete ${c.title}`}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
