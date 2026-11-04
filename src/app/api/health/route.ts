import { NextResponse } from "next/server";
import { queryRaw } from "@/db/client";

/**
 * GET /api/health
 * Liveness (+ readiness) probe, intentionally public (no auth) and free of
 * sensitive information.
 *
 * Returns 200 when the process is up and the database answers a trivial query,
 * 503 otherwise. Environment variables are never exposed in the response.
 */
export async function GET() {
  const uptime = Math.round(process.uptime());
  const timestamp = new Date().toISOString();

  let dbOk = false;
  try {
    await queryRaw("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }

  if (!dbOk) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        uptime,
        timestamp,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    uptime,
    timestamp,
    version: process.env.npm_package_version,
  });
}
