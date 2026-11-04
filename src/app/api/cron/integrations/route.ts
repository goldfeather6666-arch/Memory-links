import { NextRequest, NextResponse } from "next/server";
import { queryRaw } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { enqueueConnectorSync } from "@/server/connectors/jobs";

/**
 * POST /api/cron/integrations
 *
 * Protected endpoint for the scheduled integration sync runner (called by
 * Vercel Cron or an external scheduler). Authorization uses
 * INTEGRATIONS_CRON_SECRET. Finds connections whose next_sync_at is due and
 * enqueues a scheduled sync job per connection; the durable job is executed
 * by the connector worker.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();
  const cronSecret = env.INTEGRATIONS_CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await queryRaw<{
    connectionId: string;
    workspaceId: string;
    ownerId: string;
  }>(
    `SELECT id AS "connectionId", workspace_id AS "workspaceId", owner_id AS "ownerId"
       FROM connections
      WHERE status = 'connected' AND next_sync_at <= now()`,
  );

  let enqueued = 0;
  for (const row of due) {
    await enqueueConnectorSync(row.ownerId, row.workspaceId, row.connectionId, "scheduled");
    enqueued += 1;
  }

  return NextResponse.json({ enqueued });
}
