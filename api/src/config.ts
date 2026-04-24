type AxoriaConfig = {
  nodeEnv: string;
  isProduction: boolean;
  host: string;
  port: number;
  publicApiUrl: string | null;
  solanaRpcUrl: string;
  clickhouseUrl: string;
  clickhouseDatabase: string;
  corsOrigins: string[];
  trustProxy: boolean;
  controlPlaneServiceToken: string;
  rateLimitEnabled: boolean;
  publicRateLimitWindowMs: number;
  publicRateLimitMax: number;
};

export const config: AxoriaConfig = buildConfig();

function buildConfig(): AxoriaConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
  const trustProxy = parseBoolean(process.env.TRUST_PROXY, false);
  const controlPlaneServiceToken = (process.env.CONTROL_PLANE_SERVICE_TOKEN ?? '').trim();

  const nextConfig: AxoriaConfig = {
    nodeEnv,
    isProduction,
    host: process.env.HOST ?? '0.0.0.0',
    port: parseNumber(process.env.PORT, 3100),
    publicApiUrl: normalizeOptionalUrl(process.env.PUBLIC_API_URL),
    solanaRpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
    clickhouseUrl: process.env.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123',
    clickhouseDatabase: process.env.CLICKHOUSE_DATABASE ?? 'usdc_ops',
    corsOrigins,
    trustProxy,
    controlPlaneServiceToken,
    rateLimitEnabled:
      (process.env.RATE_LIMIT_ENABLED ?? (nodeEnv === 'test' ? 'false' : 'true')) === 'true',
    publicRateLimitWindowMs: parseNumber(process.env.PUBLIC_RATE_LIMIT_WINDOW_MS, 60_000),
    publicRateLimitMax: parseNumber(process.env.PUBLIC_RATE_LIMIT_MAX, 120),
  };

  validateConfig(nextConfig);
  return nextConfig;
}

function parseCorsOrigins(value?: string) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (!value) {
    return defaultValue;
  }
  return matchesTruthy(value);
}

function matchesTruthy(value: string) {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionalUrl(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}

function validateConfig(nextConfig: AxoriaConfig) {
  if (!nextConfig.isProduction) {
    return;
  }

  if (nextConfig.corsOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must list at least one allowed origin in production.');
  }

  if (nextConfig.corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot be "*" in production.');
  }

  if (!nextConfig.controlPlaneServiceToken) {
    throw new Error('CONTROL_PLANE_SERVICE_TOKEN is required in production.');
  }

  if (!nextConfig.publicApiUrl) {
    throw new Error('PUBLIC_API_URL is required in production.');
  }
}
