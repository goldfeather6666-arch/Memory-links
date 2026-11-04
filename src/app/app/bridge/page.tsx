import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/app/icons";

export default function BridgePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-soft-white">Agent Bridge</h1>
        <p className="mt-1 text-sm text-slate">Connect external agents.</p>
      </header>
      <EmptyState
        icon={<Icon name="bridge" size={28} />}
        title="Bridge arrives in Part 3"
        description="External agent integrations are a future phase and are not implemented yet."
      />
    </div>
  );
}
