import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/app/icons";

export default function KnowledgeGraphPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-soft-white">Knowledge Graph</h1>
        <p className="mt-1 text-sm text-slate">Explore relationships across your memories.</p>
      </header>
      <EmptyState
        icon={<Icon name="graph" size={28} />}
        title="No graph yet"
        description="When memory records and relationships are formed, your knowledge graph will render here."
      />
    </div>
  );
}
