import { getCurrentSession } from "@/server/auth/session";
import { getProcessingOverview } from "@/server/memory/lifecycle";
import { listJobsForUser } from "@/server/memory/queue";
import { listIngestionsForUser } from "@/server/memory/ingestion";
import { ProcessingPanel } from "@/components/app/memory/processing-panel";

export default async function ProcessingPage() {
  const session = await getCurrentSession();
  if (!session) {
    return <p className="p-8 text-soft-white">You must be signed in.</p>;
  }
  const [overview, jobs, ingestions] = await Promise.all([
    getProcessingOverview(session.id),
    listJobsForUser(session.id, { limit: 50 }),
    listIngestionsForUser(session.id, { limit: 50 }),
  ]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-soft-white">Processing Center</h1>
        <p className="text-sm text-slate">Track ingestion, extraction, and embedding jobs. Retry failures here.</p>
      </div>
      <ProcessingPanel overview={overview} jobs={jobs} ingestions={ingestions} />
    </div>
  );
}
