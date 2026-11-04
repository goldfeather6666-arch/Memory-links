# Environment variables

This table is derived precisely from **`src/lib/env.ts`** (both the
`serverEnvSchema` validated on the server and the public `publicEnv` object).
"Required" reflects the schema: a **required** variable causes startup to fail
if missing/invalid; **optional** variables have the shown default or are
absent. "Secret" indicates the value must be treated as a credential
(never committed, never exposed to the browser). OAuth **client IDs** are
public identifiers; **client secrets / app secrets** are credentials.

## Server variables (validated by `serverEnvSchema`)

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | yes | Postgres connection string used by the connection pool (`src/db/client.ts`). Connects with TLS and `ssl.rejectUnauthorized:false`. |
| `APP_URL` | no (default `http://localhost:3000`) | no | Public base URL used to build email action links (verify/reset) and the connector OAuth callback URL. Use the production URL in production. |
| `SESSION_TTL_DAYS` | no (default `30`) | no | Session lifetime in days applied when creating session rows. |
| `SMTP_HOST` | no | no | SMTP server host for outbound mail. |
| `SMTP_PORT` | no | no | SMTP server port (positive integer). |
| `SMTP_USER` | no | yes | SMTP authentication username. |
| `SMTP_PASS` | no | yes | SMTP authentication password. |
| `SMTP_FROM` | no | no | From address for outbound mail. |
| `AI_PROVIDER` | no | no | Memory-engine provider selector (enum `openai`). When unset the engine records retryable failures rather than fabricating memories/embeddings. |
| `OPENAI_API_KEY` | no | yes | API key for the OpenAI provider. |
| `OPENAI_BASE_URL` | no (default `https://api.openai.com/v1`) | no | OpenAI API base URL. |
| `OPENAI_MODEL` | no (default `gpt-4o-mini`) | no | Default model for the memory AI provider. |
| `EMBEDDING_PROVIDER` | no | no | Embedding provider selector (enum `openai`). |
| `EMBEDDING_MODEL` | no (default `text-embedding-3-small`) | no | Embedding model name. |
| `EMBEDDING_DIM` | no (default `1536`) | no | Embedding dimension (positive integer). |
| `INTELLIGENCE_CRON_SECRET` | no | yes | Bearer secret that authorizes `POST /api/cron/intelligence`. |
| `CHAT_PROVIDER` | no | no | Chat provider selector (enum `openai`). When unset, chat uses the deterministic evidence-grounded path. |
| `CHAT_MODEL_SMALL` | no (default `gpt-4o-mini`) | no | Small chat model id. |
| `CHAT_MODEL_LARGE` | no (default `gpt-4o`) | no | Large chat model id. |
| `CHAT_KEY_ENCRYPTION_SECRET` | no | yes | Server-only secret encrypting BYOK provider keys at rest (AES-256-GCM). If unset, BYOK is disabled. |
| `AGENT_BRIDGE_ENCRYPTION_SECRET` | no | yes | Server-only secret encrypting agent/webhook secrets at rest. Falls back to `CHAT_KEY_ENCRYPTION_SECRET` when unset. |
| `AGENT_API_RATE_LIMIT` | no (default `120`) | no | Per-agent API rate limit (requests/minute). |
| `AGENT_CONTEXT_MAX_MEMORIES` | no (default `40`) | no | Max memories in an agent context package. |
| `CONNECTOR_ENCRYPTION_SECRET` | no | yes | Required to store connector OAuth tokens at rest (AES-256-GCM). Falls back to `AGENT_BRIDGE_ENCRYPTION_SECRET`, then `CHAT_KEY_ENCRYPTION_SECRET`. |
| `INTEGRATIONS_CRON_SECRET` | no | yes | Bearer secret that authorizes `POST /api/cron/integrations`. |
| `GOOGLE_OAUTH_CLIENT_ID` | no | no | Google OAuth client id (Google Drive / Gmail). Also used as the OneDrive placeholder client id. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | no | yes | Google OAuth client secret. |
| `GITHUB_OAUTH_CLIENT_ID` | no | no | GitHub OAuth client id. |
| `GITHUB_OAUTH_CLIENT_SECRET` | no | yes | GitHub OAuth client secret. |
| `NOTION_OAUTH_CLIENT_ID` | no | no | Notion OAuth client id. |
| `NOTION_OAUTH_CLIENT_SECRET` | no | yes | Notion OAuth client secret. |
| `GITLAB_OAUTH_CLIENT_ID` | no | no | GitLab OAuth client id. |
| `GITLAB_OAUTH_CLIENT_SECRET` | no | yes | GitLab OAuth client secret. |
| `SLACK_OAUTH_CLIENT_ID` | no | no | Slack OAuth client id. |
| `SLACK_OAUTH_CLIENT_SECRET` | no | yes | Slack OAuth client secret. |
| `LINEAR_OAUTH_CLIENT_ID` | no | no | Linear OAuth client id. |
| `LINEAR_OAUTH_CLIENT_SECRET` | no | yes | Linear OAuth client secret. |
| `JIRA_OAUTH_CLIENT_ID` | no | no | Jira OAuth client id. |
| `JIRA_OAUTH_CLIENT_SECRET` | no | yes | Jira OAuth client secret. |
| `DROPBOX_OAUTH_APP_KEY` | no | no | Dropbox app key. |
| `DROPBOX_OAUTH_APP_SECRET` | no | yes | Dropbox app secret. |

## Public variables (safe to expose to the browser)

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | no | no | Client-visible site URL. Resolves to `APP_URL`, then `http://localhost:3000` when unset (`src/lib/env.ts` `publicEnv`). |

## Notes

- `.env.example` additionally lists `JOB_CONCURRENCY`, `JOB_TIMEOUT_MS`,
  `JOB_MAX_ATTEMPTS`, and `INGESTION_MAX_BYTES`. These are **not validated**
  by `src/lib/env.ts` and are retained as tuning leftovers — they are not part
  of the validated schema above.
- OAuth client credentials are optional per provider. When absent, connecting
  that provider is unavailable and the UI shows it as not-configured
  (`src/server/connectors/registry.ts` `isProviderConfigured`).
- Server-only secrets (`DATABASE_URL`, `OPENAI_API_KEY`, SMTP password, all
  `*_ENCRYPTION_SECRET`, cron secrets, OAuth client secrets/dropbox app
  secret) must never be exposed to the browser or committed to the
  repository. Only client IDs and `NEXT_PUBLIC_*` are public.
