# Axoria Production Env Contract

This is the minimum runtime contract to deploy Axoria safely without relying on local-development defaults.

## API

Required in production:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3100
DATABASE_URL=postgresql://...
CLICKHOUSE_URL=http://...
CLICKHOUSE_DATABASE=usdc_ops
CORS_ORIGIN=https://axoria.fun,https://app.axoria.fun
TRUST_PROXY=true
PUBLIC_API_URL=https://api.axoria.fun
CONTROL_PLANE_SERVICE_TOKEN=<long-random-secret>
SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/<key>
RATE_LIMIT_ENABLED=true
PUBLIC_RATE_LIMIT_WINDOW_MS=60000
PUBLIC_RATE_LIMIT_MAX=120
```

Notes:

- `CORS_ORIGIN` accepts a comma-separated allowlist.
- `CONTROL_PLANE_SERVICE_TOKEN` must be shared with the Yellowstone worker.
- `TRUST_PROXY=true` is required when the API sits behind Cloudflare Tunnel, Nginx, or any reverse proxy.

## Frontend

Required for production builds:

```env
VITE_API_BASE_URL=https://api.axoria.fun
VITE_SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/<key>
```

Optional:

```env
VITE_ALCHEMY_API_KEY=<key-or-full-url>
```

Use either `VITE_SOLANA_RPC_URL` or `VITE_ALCHEMY_API_KEY`.

## Yellowstone Worker

Required in production:

```env
NODE_ENV=production
YELLOWSTONE_ENDPOINT=https://...
YELLOWSTONE_TOKEN=<provider-token-if-required>
CLICKHOUSE_URL=http://...
CLICKHOUSE_DATABASE=usdc_ops
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CONTROL_PLANE_API_URL=https://api.axoria.fun
CONTROL_PLANE_SERVICE_TOKEN=<same-as-api>
WORKSPACE_REFRESH_INTERVAL_SECONDS=60
```

## Immediate secret actions

The repo history previously contained a real `COLOSSEUM_COPILOT_PAT`. Rotate it. Do not reuse it.

Also treat these values as deploy-time secrets and keep them out of git:

- Supabase/Postgres connection string
- Solana RPC provider key
- Yellowstone provider token
- Control-plane service token
- Any future email / analytics / webhook secrets
