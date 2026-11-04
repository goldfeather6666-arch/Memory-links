import crypto from "node:crypto";
import { queryRaw, queryTenant } from "@/db/client";
import { decryptSecret, encryptSecret, encryptionConfigured } from "./crypto";
import { recordAgentAudit } from "./audit";
import { AGENT_EVENTS } from "./types";
import type { AgentEvent } from "./types";

export interface WebhookSubscription {
  id: string;
  ownerId: string;
  workspaceId: string;
  agentId: string | null;
  url: string;
  enabled: boolean;
  events: string[];
  createdAt: string;
  updatedAt: string;
}

const MAX_ATTEMPTS = 5;
const EVENT_SET = new Set<string>(AGENT_EVENTS as readonly string[]);

function mapSubscription(row: Record<string, unknown>): WebhookSubscription {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    workspaceId: String(row.workspace_id),
    agentId: row.agent_id ? String(row.agent_id) : null,
    url: String(row.url),
    enabled: Boolean(row.enabled),
    events: (row.events as string[]) ?? [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function createSubscription(
  userId: string,
  input: { workspaceId: string; agentId?: string; url: string; events: string[] },
): Promise<{ subscription: WebhookSubscription; secret: string }> {
  if (!encryptionConfigured()) throw new Error("ENCRYPTION_NOT_CONFIGURED");
  let url: URL;
  try {
    url = new URL(input.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    throw new Error("BAD_REQUEST:invalid url");
  }
  const events = [...new Set(input.events.filter((e) => EVENT_SET.has(e)))];
  if (events.length === 0) throw new Error("BAD_REQUEST:no valid events");
  const secret = crypto.randomBytes(32).toString("base64url");
  const secretEnc = encryptSecret(secret);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO agent_webhook_subscriptions (owner_id, workspace_id, agent_id, url, secret_enc, enabled, events)
     VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING *`,
    [userId, input.workspaceId, input.agentId ?? null, url.toString(), secretEnc, events],
  );
  await recordAgentAudit({
    userId,
    agentId: input.agentId ?? null,
    workspaceId: input.workspaceId,
    action: "webhook.subscribed",
    metadata: { events },
  });
  return { subscription: mapSubscription(rows[0]), secret };
}

export async function listSubscriptions(userId: string, workspaceId: string): Promise<WebhookSubscription[]> {
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT * FROM agent_webhook_subscriptions WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId],
  );
  return rows.map(mapSubscription);
}

export async function updateSubscription(
  userId: string,
  id: string,
  patch: { enabled?: boolean; url?: string; events?: string[] },
): Promise<WebhookSubscription | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (patch.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(patch.enabled); }
  if (patch.url !== undefined) { sets.push(`url = $${idx++}`); params.push(patch.url); }
  if (patch.events !== undefined) {
    const events = [...new Set(patch.events.filter((e) => EVENT_SET.has(e)))];
    sets.push(`events = $${idx++}`);
    params.push(events);
  }
  if (sets.length === 0) return null;
  params.push(id);
  const rows = await queryTenant<Record<string, unknown>>(
    userId,
    `UPDATE agent_webhook_subscriptions SET ${sets.join(", ")}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    params,
  );
  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function deleteSubscription(userId: string, id: string): Promise<void> {
  await queryTenant(userId, `DELETE FROM agent_webhook_subscriptions WHERE id = $1`, [id]);
}

export async function rotateSubscriptionSecret(
  userId: string,
  id: string,
): Promise<{ secret: string }> {
  if (!encryptionConfigured()) throw new Error("ENCRYPTION_NOT_CONFIGURED");
  const secret = crypto.randomBytes(32).toString("base64url");
  await queryTenant(
    userId,
    `UPDATE agent_webhook_subscriptions SET secret_enc = $2, updated_at = now() WHERE id = $1`,
    [id, encryptSecret(secret)],
  );
  return { secret };
}

interface WebhookRefs {
  workspaceId: string;
  agentId?: string | null;
  resourceType?: string;
  memoryId?: string | null;
  contributionId?: string;
}

async function createAndDeliver(
  userId: string,
  event: AgentEvent,
  refs: WebhookRefs,
  sub: Record<string, unknown>,
): Promise<void> {
  const eventId = crypto.randomUUID();
  const resourceId = refs.memoryId ?? refs.contributionId ?? refs.agentId ?? null;
  const payload = {
    event,
    event_id: eventId,
    occurred_at: new Date().toISOString(),
    resource: { type: refs.resourceType ?? "memory", id: resourceId },
  };
  const body = JSON.stringify(payload);
  const secret = decryptSecret(String(sub.secret_enc));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const idemKey = eventId;

  const insertRows = await queryTenant<Record<string, unknown>>(
    userId,
    `INSERT INTO webhook_deliveries (subscription_id, event_id, event, request_url, status, attempt, idempotency_key, next_attempt_at)
     VALUES ($1, $2, $3, $4, 'pending', 1, $5, now()) RETURNING id`,
    [String(sub.id), eventId, event, String(sub.url), idemKey],
  );
  const deliveryId = String(insertRows[0].id);

  try {
    const res = await fetch(String(sub.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mnemosyne-event": event,
        "x-mnemosyne-event-id": eventId,
        "x-mnemosyne-signature": `sha256=${signature}`,
        "idempotency-key": idemKey,
        "user-agent": "mnemosyne-agent-bridge/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const status = res.ok ? "delivered" : "failed";
    const bodyText = (await res.text()).slice(0, 2000);
    await queryTenant(
      userId,
      `UPDATE webhook_deliveries SET status=$2, status_code=$3, response_body=$4,
              delivered_at = CASE WHEN $2='delivered' THEN now() ELSE NULL END,
              next_attempt_at = CASE WHEN $2='delivered' THEN NULL ELSE now() + interval '1 minute' END
        WHERE id=$1`,
      [deliveryId, status, res.status, bodyText],
    );
    if (!res.ok) await scheduleRetry(userId, deliveryId, 1, String(sub.id));
  } catch (e) {
    await queryTenant(
      userId,
      `UPDATE webhook_deliveries SET status='failed', response_body=$2, next_attempt_at = now() + interval '1 minute' WHERE id=$1`,
      [deliveryId, e instanceof Error ? e.message.slice(0, 2000) : "delivery error"],
    );
    await scheduleRetry(userId, deliveryId, 1, String(sub.id));
  }
}

async function scheduleRetry(
  userId: string,
  deliveryId: string,
  attempt: number,
): Promise<void> {
  if (attempt >= MAX_ATTEMPTS) return;
  const nextAttempt = new Date(Date.now() + Math.pow(2, attempt) * 60_000).toISOString();
  await queryTenant(
    userId,
    `UPDATE webhook_deliveries SET status='retrying', attempt=$2, next_attempt_at=$3 WHERE id=$1`,
    [deliveryId, attempt + 1, nextAttempt],
  ).catch(() => undefined);
}

async function performDeliveries(userId: string, event: AgentEvent, refs: WebhookRefs): Promise<void> {
  const subs = await queryTenant<Record<string, unknown>>(
    userId,
    `SELECT s.id, s.url, s.secret_enc, s.agent_id, s.events
       FROM agent_webhook_subscriptions s
      WHERE s.workspace_id = $1 AND s.enabled = true`,
    [refs.workspaceId],
  );
  for (const row of subs) {
    const eventsList = (row.events as string[]) ?? [];
    if (!eventsList.includes(event) && !eventsList.includes("*")) continue;
    if (row.agent_id && refs.agentId && String(row.agent_id) !== String(refs.agentId)) continue;
    await createAndDeliver(userId, event, refs, row);
  }
}

/**
 * Fire an event notification. Best-effort and never throws, so callers can
 * emit events without risking memory-mutation flows.
 */
export async function emitEvent(
  userId: string,
  event: AgentEvent,
  refs: WebhookRefs,
): Promise<void> {
  try {
    await performDeliveries(userId, event, refs);
  } catch {
    /* never break the caller */
  }
}

/**
 * Process due delivery retries. Accepts an authenticated user id when invoked
 * from a request context; otherwise runs as an internal maintenance job via
 * queryRaw (which touches only delivery rows, never user content).
 */
export async function processPendingDeliveries(userId?: string): Promise<number> {
  const sql = `SELECT d.id, d.subscription_id, d.event, d.event_id, d.attempt, d.idempotency_key, d.request_url,
                      s.secret_enc, s.url
                 FROM webhook_deliveries d
                 JOIN agent_webhook_subscriptions s ON s.id = d.subscription_id
                WHERE d.status IN ('pending','retrying','failed') AND d.attempt < $1 AND d.next_attempt_at <= now()
                ORDER BY d.created_at LIMIT 20`;
  const rows = userId
    ? await queryTenant<Record<string, unknown>>(userId, sql, [MAX_ATTEMPTS])
    : await queryRaw<Record<string, unknown>>(sql, [MAX_ATTEMPTS]);
  let attempted = 0;
  for (const row of rows) {
    let secret: string;
    try {
      secret = decryptSecret(String(row.secret_enc));
    } catch {
      continue;
    }
    const payload = {
      event: String(row.event),
      event_id: String(row.event_id),
      occurred_at: new Date().toISOString(),
      resource: {},
    };
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    try {
      const res = await fetch(String(row.url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mnemosyne-signature": `sha256=${signature}`,
          "idempotency-key": String(row.idempotency_key),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const status = res.ok ? "delivered" : "failed";
      const bodyText = (await res.text()).slice(0, 2000);
      const upd = `UPDATE webhook_deliveries SET status=$2, status_code=$3, response_body=$4,
                          delivered_at = CASE WHEN $2='delivered' THEN now() ELSE NULL END,
                          next_attempt_at = CASE WHEN $2='delivered' THEN NULL ELSE now() + interval '2 minute' END
                    WHERE id=$1`;
      if (userId) await queryTenant(userId, upd, [String(row.id), status, res.status, bodyText]);
      else await queryRaw(upd, [String(row.id), status, res.status, bodyText]);
      attempted += 1;
      if (!res.ok) await scheduleRetry(userId ?? "", String(row.id), Number(row.attempt), String(row.subscription_id));
    } catch {
      await scheduleRetry(userId ?? "", String(row.id), Number(row.attempt), String(row.subscription_id));
      attempted += 1;
    }
  }
  return attempted;
}
