import { NextResponse } from "next/server";

/**
 * GET /api/health/metrics
 * Public, unauthenticated runtime counters for basic observability. Returns no
 * sensitive data, credentials, or environment values.
 */

/**
 * Estimate event-loop lag by measuring how long a zero-delay timer tick takes.
 * Under a healthy, idle loop this is a few milliseconds; sustained high values
 * indicate the main thread is blocked by synchronous work.
 */
async function measureEventLoopLag(): Promise<number> {
  const before = process.hrtime.bigint();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const after = process.hrtime.bigint();
  return Number(after - before) / 1e6;
}

export async function GET() {
  const lagMs = await measureEventLoopLag();
  const bytesToMb = (bytes: number): number =>
    Number((bytes / (1024 * 1024)).toFixed(2));

  const memory = process.memoryUsage();
  const memoryMb = {
    rss: bytesToMb(memory.rss),
    heapTotal: bytesToMb(memory.heapTotal),
    heapUsed: bytesToMb(memory.heapUsed),
    external: bytesToMb(memory.external),
    arrayBuffers: bytesToMb(memory.arrayBuffers),
  };

  return NextResponse.json({
    uptimeSeconds: Math.round(process.uptime()),
    eventLoopLagMs: Math.round(lagMs * 100) / 100,
    memoryMb,
    timestamp: new Date().toISOString(),
  });
}
