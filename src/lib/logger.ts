/**
 * MNEMOSYNE — minimal dependency-free structured logger.
 *
 * Emits one JSON line per entry to stdout (captured by the platform's log
 * collector). A redaction helper scrubs sensitive fields (tokens, passwords,
 * keys, Authorization headers) so secrets never reach logs. For request-scoped
 * entries use logWithReq, which adds method/path/ip and optional userId.
 */

type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const SECRET_KEY_RE = /secret|token|password|passwd|key|authorization|credential|api[_-]?key/i;

function redactValue(value: unknown, key: string): unknown {
  if (typeof value === "string" && SECRET_KEY_RE.test(key)) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, key));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, k);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, entry: LogFields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...entry });
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  info(fields: LogFields): void {
    emit("info", redactValue(fields, "") as LogFields);
  },
  warn(fields: LogFields): void {
    emit("warn", redactValue(fields, "") as LogFields);
  },
  error(fields: LogFields): void {
    emit("error", redactValue(fields, "") as LogFields);
  },
};

/** Request-scoped logging helper (method, path, IP, optional userId). */
export function logWithReq(
  level: LogLevel,
  req: Request,
  fields: LogFields,
  userId?: string,
): void {
  const url = new URL(req.url);
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : req.headers.get("x-real-ip") ?? undefined;
  const base: LogFields = {
    msg: fields.msg,
    method: req.method,
    path: url.pathname,
    ...(ip ? { ip } : {}),
    ...(userId ? { userId } : {}),
  };
  const { msg: _msg, ...rest } = fields;
  const merged = { ...base, ...rest };
  emit(level, redactValue(merged, "") as LogFields);
}
