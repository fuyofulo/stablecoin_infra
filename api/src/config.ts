export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3100),
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  clickhouseUrl: process.env.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123',
  clickhouseDatabase: process.env.CLICKHOUSE_DATABASE ?? 'usdc_ops',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  controlPlaneServiceToken: process.env.CONTROL_PLANE_SERVICE_TOKEN ?? '',
  rateLimitEnabled:
    (process.env.RATE_LIMIT_ENABLED ??
      (process.env.NODE_ENV === 'test' ? 'false' : 'true')) === 'true',
  publicRateLimitWindowMs: Number(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS ?? 60_000),
  publicRateLimitMax: Number(process.env.PUBLIC_RATE_LIMIT_MAX ?? 120),
};
