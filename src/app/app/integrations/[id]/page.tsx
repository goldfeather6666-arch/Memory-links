import { getCurrentSession } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { ConnectionDetail } from "@/components/app/integrations/connection-detail";

/**
 * /app/integrations/[id] — connection detail. Auth-gated.
 */

export default async function ConnectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) {
    redirect(`/signin?next=/app/integrations/${id}`);
  }
  return <ConnectionDetail connectionId={id} workspaceId="" />;
}
