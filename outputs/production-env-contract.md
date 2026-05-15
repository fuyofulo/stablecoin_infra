# Decimal Runtime Contract

The simplified runtime model for Decimal. Used to decide what goes in env vars vs committed config vs frontend public config.

Do not think in terms of "a lot of secrets." Think in terms of:

- **real secrets** — auth credentials, DB strings, provider tokens
- **plain config** — deployment settings (host, port, CORS, rate limits)
- **public frontend values** — anything that ships to the browser

## File layout

### Config files (committed, non-secret)

- [config/api.config.json](/Users/fuyofulo/code/stablecoin_intelligence/config/api.config.json) — API runtime settings
- [config/frontend.public.json](/Users/fuyofulo/code/stablecoin_intelligence/config/frontend.public.json) — Frontend runtime settings

### Secret env files (local or deploy-time only)

- [api/.env.example](/Users/fuyofulo/code/stablecoin_intelligence/api/.env.example) — template for `api/.env`
- repo root [`.env`](/Users/fuyofulo/code/stablecoin_intelligence/.env) — local tooling only

The frontend does not need a secret env file. The Yellowstone worker has been retired and is no longer part of the runtime.

## 1. Real secrets

These must never go in git, docs, screenshots, or frontend `VITE_*` env vars.

### Required (API will not start without these)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `OAUTH_STATE_SECRET` | Long random secret for signing OAuth state tokens |

### Auth providers

| Variable | Required when | Purpose |
| --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Google sign-in is enabled | Google OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google sign-in is enabled | Google OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Custom redirect needed | Defaults to `{publicApiUrl}/auth/google/callback` |

### Wallet provider (Privy)

| Variable | Required when | Purpose |
| --- | --- | --- |
| `PRIVY_APP_ID` | Creating Privy embedded wallets from API | Privy app identifier |
| `PRIVY_APP_SECRET` | Creating Privy embedded wallets from API | Privy app secret |
| `PRIVY_API_BASE_URL` | Always (defaults to `https://api.privy.io`) | Privy API base |

### Email provider (Resend)

| Variable | Required when | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Production email sends | Resend API key. If unset, `/auth/register` falls back to returning the verification code in the response (dev only) |
| `RESEND_FROM_EMAIL` | Production email sends | Verified sender address |
| `RESEND_FROM_NAME` | Production email sends | Display name (defaults to `Decimal`) |

### AI provider (OpenRouter)

| Variable | Required when | Purpose |
| --- | --- | --- |
| `OPEN_ROUTER_API_KEY` | Doc-to-proposal pipeline (invoice extraction) | OpenRouter API key. Free tier requires "free endpoints that may train on inputs" enabled under privacy. |

### Treasury provider (Squads Grid — optional)

Only used by `/treasury-wallets/grid/*` routes. Skip entirely if not running the Grid integration.

| Variable | Required when | Purpose |
| --- | --- | --- |
| `GRID_API_KEY` | Any Grid route is hit | Grid API key from Squads |
| `GRID_ENVIRONMENT` | Any Grid route is hit | `sandbox` or `production` (defaults to `sandbox`) |
| `GRID_BASE_URL` | Custom base URL needed | Optional override |
| `GRID_APP_ID` | Custom app ID needed | Optional override |
| `GRID_TIMEOUT_MS` | Tuning needed | Default `15000` |
| `GRID_RETRY_ATTEMPTS` | Tuning needed | Default `2` |

### Solana RPC

| Variable | Required when | Purpose |
| --- | --- | --- |
| `SOLANA_NETWORK` | Always | `devnet` or `mainnet`. Drives USDC mint, Squads program, and the network advertised to the frontend via `/capabilities` |
| `SOLANA_RPC_URL` | Always | Backend RPC endpoint. Treat as a secret if it carries a paid provider key |
| `SOLANA_DEVNET_RPC_URL` | Optional | Devnet-specific override |

## 2. Plain config

Lives in [config/api.config.json](/Users/fuyofulo/code/stablecoin_intelligence/config/api.config.json). Not secrets. Deployment settings only.

| Field | Purpose |
| --- | --- |
| `host` | Bind host |
| `port` | API port |
| `publicApiUrl` | Canonical public API URL used in OpenAPI and OAuth redirects |
| `publicFrontendUrl` | Canonical public frontend URL |
| `corsOrigins` | Array of allowed frontend origins |
| `trustProxy` | Set `true` behind Cloudflare or any reverse proxy |
| `rateLimitEnabled` | Toggle request rate limiting |
| `publicRateLimitWindowMs` | Rate limit window |
| `publicRateLimitMax` | Rate limit max requests per window |

`NODE_ENV` stays in the runtime env because it is standard process mode, not business config.

## 3. Public frontend values

Lives in [config/frontend.public.json](/Users/fuyofulo/code/stablecoin_intelligence/config/frontend.public.json). Not secrets — these ship to the browser.

| Field | Purpose |
| --- | --- |
| `apiBaseUrl` | Frontend → API base URL (production) |
| `localApiBaseUrl` | Frontend → API base URL (local dev) |
| `solanaRpcUrl` | Browser-side Solana RPC URL |

## Important frontend warning

Anything in `frontend.public.json` is **public** once the frontend is built and deployed.

```json
"solanaRpcUrl": "https://solana-mainnet.g.alchemy.com/v2/..."
```

is not private. If you keep using a private-provider URL in the frontend:

- treat it as a public client key
- enforce provider-side restrictions if available
- do not rely on secrecy

If you want a truly private RPC key, keep it only on the backend as `SOLANA_RPC_URL` and do not expose it through frontend public config.

## Minimum production secret set

The smallest set of real secrets that runs Decimal in production with email auth + Privy wallets + Squads multisig:

```env
DATABASE_URL=postgresql://...
OAUTH_STATE_SECRET=<long-random-secret>
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
SOLANA_NETWORK=mainnet
SOLANA_RPC_URL=https://...
```

Add Google OAuth, OpenRouter, or Grid credentials only when those features are turned on.

## Recommended storage

### Local developer machine

- Repo root [`.env`](/Users/fuyofulo/code/stablecoin_intelligence/.env) — local tooling only (e.g. `COLOSSEUM_COPILOT_PAT`)
- `api/.env` — copy of `api/.env.example` filled in for local dev (defaults to devnet, local Postgres)

### API deployment env

All secrets from section 1 above, scoped to environment (devnet vs mainnet). Plain config comes from `config/api.config.json` — committed, not env-managed.

### Frontend deploy env

No secret envs required. Public runtime settings come from `config/frontend.public.json`.

## Operational rules

**Decision rule**

- if it reaches the browser, it is public
- if it authenticates infra, it is a secret
- if it only changes runtime behavior, it is config

**Cleanup rule**

Never commit:

- provider tokens (Privy, Resend, OpenRouter, Grid, Google OAuth)
- Postgres connection strings
- service-to-service auth tokens
- real RPC secrets
