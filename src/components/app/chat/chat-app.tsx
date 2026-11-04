"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { ConversationSidebar } from "./conversation-sidebar";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { ContextPanel } from "./context-panel";
import type {
  ChatConversation,
  ChatMessage,
  ChatSettings,
  ChatSettingsResponse,
} from "./types";

interface ChatAppProps {
  workspaceId: string;
  initialConversations?: ChatConversation[];
  initialConversation?: ChatConversation | null;
  initialMessages?: ChatMessage[];
}

export function ChatApp({
  workspaceId,
  initialConversations = [],
  initialConversation = null,
  initialMessages = [],
}: ChatAppProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [active, setActive] = useState<ChatConversation | null>(initialConversation);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const clientRequestId = useRef(0);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data && (data.error as string)) || `Request failed (${res.status})`);
      }
      return data;
    },
    [],
  );

  const loadConversations = useCallback(async () => {
    try {
      const data = await api(`/api/v1/conversations?ws=${workspaceId}`);
      setConversations(data.items ?? []);
    } catch {
      // silent
    }
  }, [api, workspaceId]);

  const openConversation = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const conv = await api(`/api/v1/conversations/${id}`);
        const page = await api(`/api/v1/conversations/${id}/messages?ws=${workspaceId}`);
        setActive(conv);
        setMessages(page.items ?? []);
        setShowContext(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [api, workspaceId],
  );

  const newConversation = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const conv = await api(`/api/v1/conversations?ws=${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadConversations();
      setActive(conv);
      setMessages([]);
      setShowContext(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [api, workspaceId, loadConversations]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!active) return;
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      clientRequestId.current += 1;
      const requestId = `${Date.now()}-${clientRequestId.current}`;
      setBusy(true);
      setError(null);
      try {
        const data = await api(`/api/v1/conversations/${active.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: trimmed, clientRequestId: requestId }),
        });
        const { userMessage, assistantMessage } = data as {
          userMessage: ChatMessage;
          assistantMessage: ChatMessage | null;
        };
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== userMessage.id);
          const assembled: ChatMessage[] = [];
          let insertedUser = false;
          for (const m of next) {
            assembled.push(m);
            if (m.createdAt >= userMessage.createdAt && !insertedUser) {
              assembled.push(userMessage);
              if (assistantMessage) assembled.push(assistantMessage);
              insertedUser = true;
            }
          }
          if (!insertedUser) {
            assembled.push(userMessage);
            if (assistantMessage) assembled.push(assistantMessage);
          }
          return assembled;
        });
        setActive((prev) => (prev && prev.id === active.id ? { ...prev, lastMessageAt: new Date().toISOString() } : prev));
        await loadConversations();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [api, active, busy, loadConversations, workspaceId],
  );

  const rememberMessage = useCallback(
    async (messageId: string) => {
      if (!active) return;
      try {
        await api(`/api/v1/chat/capture`, {
          method: "POST",
          body: JSON.stringify({ conversationId: active.id, messageId }),
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, context: { ...m.context, remembered: true } } : m)),
        );
      } catch {
        // silent
      }
    },
    [api, active],
  );

  const regenerate = useCallback(
    async (userMessage: ChatMessage) => {
      if (!active || busy) return;
      // Remove the prior assistant child(ren) so retry is idempotent.
      const assistantChildren = messages.filter((m) => m.parentId === userMessage.id);
      try {
        for (const child of assistantChildren) {
          await api(`/api/v1/conversations/${active.id}/messages/${child.id}`, {
            method: "DELETE",
          });
        }
      } catch {
        // ignore
      }
      setMessages((prev) => prev.filter((m) => !assistantChildren.some((c) => c.id === m.id)));
      await sendMessage(userMessage.content);
    },
    [api, active, busy, messages, sendMessage],
  );

  const loadSettings = useCallback(async () => {
    try {
      const data = (await api(`/api/v1/chat/settings?ws=${workspaceId}`)) as ChatSettingsResponse;
      setSettings(data.settings);
    } catch {
      // silent
    }
  }, [api, workspaceId]);

  // Load initial data on mount. Both loaders are async — setState runs only
  // after the network call resolves, so it is never a synchronous render update.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void loadSettings();
    void loadConversations();
  }, [loadSettings, loadConversations]);

  const contextMeta = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return null;
    return lastAssistant.context as {
      projects?: { id: string; label: string }[];
      entities?: { id: string; label: string; type: string }[];
      timelineEvents?: { id: string; label: string; at: string | null }[];
      intent?: string;
    };
  }, [messages]);

  const saveSettings = useCallback(
    async (patch: Partial<ChatSettings>) => {
      if (!settings) return;
      try {
        const updated = (await api(`/api/v1/chat/settings?ws=${workspaceId}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        })) as ChatSettings;
        setSettings(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [api, settings, workspaceId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside
          className={`z-20 w-72 shrink-0 border-r border-white/10 bg-obsidian/60 transition-transform lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } fixed inset-y-0 left-0`}
        >
          <ConversationSidebar
            conversations={conversations}
            activeId={active?.id ?? null}
            onSelect={(id) => {
              setSidebarOpen(false);
              void openConversation(id);
            }}
            onNew={() => void newConversation()}
            onDeleted={() => void loadConversations()}
            workspaceId={workspaceId}
          />
        </aside>
        {sidebarOpen && (
          <button
            className="fixed inset-0 z-10 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversation list"
          />
        )}

        {/* Main */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4">
            <button
              className="rounded-md p-2 text-slate-300 hover:bg-white/5 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open conversation list"
            >
              <Icon name="menu" />
            </button>
            <button
              className="rounded-md p-2 text-slate-300 hover:bg-white/5"
              onClick={() => setShowContext((v) => !v)}
              title="Toggle context panel"
              aria-label="Toggle context panel"
            >
              <Icon name="layers" />
            </button>
            <div className="min-w-0 flex-1">
              {active ? (
                <input
                  value={active.title}
                  onChange={(e) => setActive({ ...active, title: e.target.value })}
                  onBlur={async () => {
                    try {
                      const updated = (await api(`/api/v1/conversations/${active.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ title: active.title }),
                      })) as ChatConversation;
                      setActive(updated);
                    } catch {
                      // silent
                    }
                  }}
                  className="w-full truncate bg-transparent text-sm font-medium text-soft-white outline-none"
                  aria-label="Conversation title"
                />
              ) : (
                <span className="text-sm text-slate-400">Mnemosyne — Ask Your Past</span>
              )}
            </div>
            <button
              className="rounded-md p-2 text-slate-300 hover:bg-white/5"
              onClick={() => setShowSettings((v) => !v)}
              title="Chat settings"
              aria-label="Chat settings"
            >
              <Icon name="settings" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {error && (
                <div className="mx-4 mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                  <button className="ml-2 underline" onClick={() => setError(null)}>
                    dismiss
                  </button>
                </div>
              )}
              {showSettings && settings && (
                <SettingsPanel
                  settings={settings}
                  onChange={saveSettings}
                  onClose={() => setShowSettings(false)}
                />
              )}
              {active ? (
                <MessageList
                  messages={messages}
                  busy={busy}
                  onRemember={rememberMessage}
                  onRegenerate={regenerate}
                />
              ) : (
                <EmptyChat onNew={() => void newConversation()} />
              )}
              <Composer busy={busy} onSubmit={sendMessage} contextIntent={contextMeta?.intent} />
            </div>
            {showContext && <ContextPanel meta={contextMeta} evidence={messages.map((m) => m.evidence).flat()} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function EmptyChat({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-2xl bg-white/5 p-4">
        <Icon name="chat" size={36} className="text-violet-400" />
      </div>
      <h2 className="text-xl font-semibold text-soft-white">Ask your past</h2>
      <p className="max-w-md text-sm text-slate-400">
        Ask questions about your memories — projects, people, decisions, and
        history — and explore the evidence behind every answer.
      </p>
      <Button onClick={onNew}>
        <Icon name="plus" size={16} className="mr-1" /> New conversation
      </Button>
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: ChatSettings;
  onChange: (patch: Partial<ChatSettings>) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="mx-4 mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-soft-white">Chat settings</h3>
        <button className="rounded p-1 text-slate-400 hover:text-soft-white" onClick={onClose} aria-label="Close settings">
          <Icon name="close" size={16} />
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={settings.automaticMemoryCapture}
          onChange={(e) => void onChange({ automaticMemoryCapture: e.target.checked })}
          className="h-4 w-4 accent-violet-500"
        />
        Automatically capture user statements as memories
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-sm text-slate-300">
          Budget cap (tokens / 30d)
          <input
            type="number"
            min={1000}
            value={settings.budgetCapTokens}
            onChange={(e) => void onChange({ budgetCapTokens: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-soft-white outline-none"
          />
        </label>
        <label className="text-sm text-slate-300">
          Model preference
          <input
            type="text"
            value={settings.modelPreference ?? ""}
            placeholder="auto"
            onChange={(e) => void onChange({ modelPreference: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-soft-white outline-none"
          />
        </label>
      </div>
    </div>
  );
}
