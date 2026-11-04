import { z } from "zod";

/**
 * Server-side environment validation. This module is only imported by server
 * code (route handlers, middleware, data layer, scripts). It never runs in
 * the browser, so it can safely require DATABASE_URL and other secrets.
 *
 * Unknown variables are ignored; known variables are validated and coerced.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  /** Memory engine (Part 3) — provider configuration. All optional; when a
   * provider is not configured the engine records retryable failures instead
   * of fabricating memories/embeddings. */
  AI_PROVIDER: z.enum(["openai"]).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  EMBEDDING_PROVIDER: z.enum(["openai"]).optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Returns the validated server environment. Throws a descriptive error listing
 * missing/invalid variables so misconfiguration fails fast at boot instead of
 * surfacing obscure runtime failures.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Public, safe-to-expose client config. */
export const publicEnv = {
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    "http://localhost:3000",
} as const;
