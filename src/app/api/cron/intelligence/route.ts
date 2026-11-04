import { NextRequest, NextResponse } from "next/server";
import { queryRaw } from "@/db/client";
import { getServerEnv } from "@/lib/env";

/**
 * POST /api/cron/intelligence
 *
 * Protected endpoint for scheduled intelligence processing. This is the only
 * "timer" entry point — the actual scheduling is external (Vercel Cron calling
 * this route). It is NOT an in-memory timer.
 *
 * It enqueues scheduled jobs for workspaces that have automatic consolidation
 * enabled (opt-in) and a non-exhausted budget. Execution itself is durable via
 * the intelligence_jobs table; a separate worker (or the post-claim run) runs
 * claimed jobs.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = getServerEnv();
  const cronSecret = env.INTELLIGENCE_CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find workspaces with automatic consolidation enabled (opt-in).
  const workspaces = await queryRaw<{ workspaceId: string }>(
    `SELECT workspace_id AS "workspaceId" FROM processing_settings
      WHERE automatic_consolidation = true`,
  );

  let enqueued = 0;
  for (const ws of workspaces) {
    // Enqueue via the orchestrator for each enabled workspace. We run this
    // inline for simplicity; it is bounded and idempotent.
    await import("@/server/intelligence/orchestrator").then(async ({ enqueueScheduledAnalysis }) => {
      // Need the owner for tenant context; take the setting row's owner.
      const ownerRows = await queryRaw<{ ownerId: string }>(
        `SELECT owner_id AS "ownerId" FROM processing_settings WHERE workspace_id = $1`,
        [ws.workspaceId],
      );
      if (ownerRows[0]?.ownerId) {
        const res = await enqueueScheduledAnalysis(ownerRows[0].ownerId, ws.workspaceId);
        enqueued += res.enqueued;
      }
    });
  }

  return NextResponse.json({ enqueued });
}
