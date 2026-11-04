import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { queryTenant } from "@/db/client";
import { handleOAuthCallback } from "@/server/connectors/oauth";
import type { ProviderId } from "@/server/connectors/types";

/**
 * GET /api/v1/integrations/oauth/callback?code=...&state=...
 * OAuth provider callback. Looks up the provider by the opaque state token,
 * completes the exchange, then redirects the browser back to the integrations
 * page with ?connected=ok or ?error=...
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const appUrl = getServerEnv().APP_URL.replace(/\/$/, "");
  const redirectBase = `${appUrl}/app/integrations`;

  if (!code || !state) {
    return NextResponse.redirect(`${redirectBase}?error=missing_params`);
  }

  try {
    const rows = await queryTenant<{ provider: string }>(
      null,
      `SELECT provider FROM oauth_states WHERE state = $1 LIMIT 1`,
      [state],
    );
    const provider = rows[0]?.provider;
    if (!provider) {
      return NextResponse.redirect(`${redirectBase}?error=invalid_state`);
    }

    await handleOAuthCallback(provider as ProviderId, code, state);
    return NextResponse.redirect(`${redirectBase}?connected=ok`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
  }
}
