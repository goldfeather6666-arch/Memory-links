import { getCurrentSession } from "@/server/auth/session";
import { redirect } from "next/navigation";
import { IntegrationsDashboard } from "@/components/app/integrations/integrations-dashboard";

/**
 * /app/integrations — Integrations Center overview. Auth-gated.
 */

export default async function IntegrationsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/signin?next=/app/integrations");
  }
  return <IntegrationsDashboard workspaceId="" />;
}
