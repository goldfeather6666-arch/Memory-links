import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/app/icons";

export default function TimelinePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-soft-white">Timeline</h1>
        <p className="mt-1 text-sm text-slate">Replay events over time.</p>
      </header>
      <EmptyState
        icon={<Icon name="timeline" size={28} />}
        title="No timeline yet"
        description="Events and memory records will form a timeline here."
      />
    </div>
  );
}
