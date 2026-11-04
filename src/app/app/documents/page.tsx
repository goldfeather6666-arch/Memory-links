import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/app/icons";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-soft-white">Documents</h1>
        <p className="mt-1 text-sm text-slate">Import and manage source material.</p>
      </header>
      <EmptyState
        icon={<Icon name="documents" size={28} />}
        title="No documents yet"
        description="Imported source material will appear here and feed your memory engine."
      />
    </div>
  );
}
