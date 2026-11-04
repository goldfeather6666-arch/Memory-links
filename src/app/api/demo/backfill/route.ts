import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { backfillDemoWorkspaces } from "@/server/demo/backfill";

export async function POST(req: NextRequest) {
  const env = getServerEnv();
  const secret = env.INTELLIGENCE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await backfillDemoWorkspaces({ limit: 25 });
  return NextResponse.json({ ok: true, ...result });
}
