import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/app/icons";

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-soft-white">AI Chat</h1>
        <p className="mt-1 text-sm text-slate">Talk to your memory.</p>
      </header>
      <EmptyState
        icon={<Icon name="chat" size={28} />}
        title="Chat arrives in Part 3"
        description="Conversational access to your memory engine is a future phase and is not implemented yet."
      />
    </div>
  );
}
