"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "@/components/app/icons";
import type { ChatEvidence, ChatMessage } from "./types";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onRemember: (messageId: string) => void;
  onRegenerate: (userMessage: ChatMessage) => void;
}

export function MessageList({ messages, busy, onRemember, onRegenerate }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded-2xl bg-white/5 p-4">
          <Icon name="spark" size={32} className="text-violet-400" />
        </div>
        <p className="max-w-md text-sm text-slate-400">
          Start by asking about something you remember discussing — a project,
          a decision, a person, or what happened "a while ago.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
      {messages.map((m) =>
        m.role === "user" ? (
          <UserMessage key={m.id} message={m} onRemember={onRemember} onRegenerate={onRegenerate} />
        ) : (
          <AssistantMessage key={m.id} message={m} />
        ),
      )}
      {busy && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          Searching your memories…
        </div>
      )}
    </div>
  );
}

function UserMessage({
  message,
  onRemember,
  onRegenerate,
}: {
  message: ChatMessage;
  onRemember: (id: string) => void;
  onRegenerate: (m: ChatMessage) => void;
}) {
  const remembered = Boolean(message.context?.remembered);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-500/20 px-4 py-2.5 text-sm text-soft-white">
        <div className="whitespace-pre-wrap">{message.content}</div>
        <div className="mt-2 flex items-center gap-2">
          <button
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-violet-300"
            onClick={() => onRemember(message.id)}
            title="Remember this as a memory"
          >
            <Icon name={remembered ? "check" : "database"} size={13} />
            {remembered ? "Remembered" : "Remember this"}
          </button>
          <button
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
            onClick={() => onRegenerate(message)}
            title="Regenerate the answer"
          >
            <Icon name="layers" size={13} /> Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="flex justify-start">
      <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-soft-white">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/30">
            <Icon name="spark" size={13} className="text-violet-300" />
          </span>
          <span className="text-xs font-medium text-violet-300">Mnemosyne</span>
          <span className="ml-auto flex items-center gap-1">
            <button
              className="rounded p-1 text-slate-400 hover:text-soft-white"
              onClick={() => void copy()}
              title="Copy response"
              aria-label="Copy response"
            >
              <Icon name={copied ? "check" : "documents"} size={14} />
            </button>
          </span>
        </div>
        <div className="prose prose-invert prose-sm max-w-none prose-pre:overflow-x-auto prose-pre:bg-black/40 prose-pre:rounded-lg prose-pre:p-3 prose-table:text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        {message.evidence.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <Icon name="database" size={12} /> Evidence
            </div>
            <div className="space-y-1.5">
              {message.evidence.map((ev) => (
                <EvidenceCard key={ev.id} evidence={ev} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: ChatEvidence }) {
  const [open, setOpen] = useState(false);
  const provenanceLabel =
    evidence.provenance === "direct"
      ? "Directly stated"
      : evidence.provenance === "summarized"
        ? "Summarized"
        : evidence.provenance === "inference"
          ? "Inference"
          : "Uncertain";
  return (
    <div className="rounded-lg border border-white/10 bg-black/20">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? "close" : "vault"} size={14} className="shrink-0 text-violet-400" />
        <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{evidence.label}</span>
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">
          {provenanceLabel}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-3 py-2 text-xs text-slate-400">
          {evidence.summary && <p className="mb-1">{evidence.summary}</p>}
          {evidence.quote && evidence.quote !== evidence.summary && (
            <blockquote className="border-l-2 border-violet-400/40 pl-2 italic">{evidence.quote}</blockquote>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span>Type: {evidence.type}</span>
            <span>Created: {new Date(evidence.createdAt).toLocaleDateString()}</span>
            {evidence.confidence !== null && <span>Confidence: {Math.round(evidence.confidence * 100)}%</span>}
          </div>
        </div>
      )}
    </div>
  );
}
