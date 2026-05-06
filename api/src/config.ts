import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type FileConfig = {
  host?: string;
  port?: number;
  publicApiUrl?: string | null;
  publicFrontendUrl?: string | null;
  clickhouseUrl?: string;
  clickhouseDatabase?: string;
  corsOrigins?: string[];
  trustProxy?: boolean;
  rateLimitEnabled?: boolean;
  publicRateLimitWindowMs?: number;
  publicRateLimitMax?: number;
  squadsProgramId?: string;
  squadsDefaultVaultIndex?: number;
  squadsDefaultTimelockSeconds?: number;
  squadsProgramTreasury?: string | null;
};

type DecimalConfig = {
  nodeEnv: string;
  isProduction: boolean;
  host: string;
  port: number;
  publicApiUrl: string | null;
  publicFrontendUrl: string | null;
  solanaNetwork: SolanaNetwork;
  solanaRpcUrl: string;
  /**
   * Always-devnet RPC URL. Used for devnet-only operations (airdrop)
   * regardless of which network the rest of the app is configured for.
   * Falls back to the public devnet endpoint if SOLANA_DEVNET_RPC_URL
   * is unset.
   */
  solanaDevnetRpcUrl: string;
  clickhouseUrl: string;
  clickhouseDatabase: string;
  corsOrigins: string[];
  trustProxy: boolean;
  controlPlaneServiceToken: string;
  rateLimitEnabled: boolean;
  publicRateLimitWindowMs: number;
  publicRateLimitMax: number;
  googleOAuthClientId: string;
  googleOAuthClientSecret: string;
  googleOAuthRedirectUri: string | null;
  oauthStateSecret: string;
  privyAppId: string;
  privyAppSecret: string;
  privyApiBaseUrl: string;
  squadsProgramId: string;
  squadsDefaultVaultIndex: number;
  squadsDefaultTimelockSeconds: number;
  squadsProgramTreasury: string | null;
};

export type SolanaNetwork = 'devnet' | 'mainnet';

export const config: DecimalConfig = buildConfig();

function buildConfig(): DecimalConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const fileConfig = loadApiFileConfig();
  const controlPlaneServiceToken = (process.env.CONTROL_PLANE_SERVICE_TOKEN ?? '').trim();
  const solanaNetwork = getSolanaNetwork();
  const solanaRpcUrl = (process.env.SOLANA_RPC_URL?.trim() || defaultSolanaRpcUrl(solanaNetwork));
  const solanaDevnetRpcUrl = (process.env.SOLANA_DEVNET_RPC_URL?.trim() || 'https://api.devnet.solana.com');

  const nextConfig: DecimalConfig = {
    nodeEnv,
    isProduction,
    host: fileConfig.host ?? '0.0.0.0',
    port: fileConfig.port ?? 3100,
    publicApiUrl: normalizeOptionalUrl(fileConfig.publicApiUrl),
    publicFrontendUrl: normalizeOptionalUrl(fileConfig.publicFrontendUrl),
    solanaNetwork,
    solanaRpcUrl,
    solanaDevnetRpcUrl,
    clickhouseUrl: fileConfig.clickhouseUrl ?? 'http://127.0.0.1:8123',
    clickhouseDatabase: fileConfig.clickhouseDatabase ?? 'usdc_ops',
    corsOrigins: normalizeStringArray(fileConfig.corsOrigins),
    trustProxy: fileConfig.trustProxy ?? false,
    controlPlaneServiceToken,
    rateLimitEnabled:
      fileConfig.rateLimitEnabled ?? (nodeEnv === 'test' ? false : true),
    publicRateLimitWindowMs: fileConfig.publicRateLimitWindowMs ?? 60_000,
    publicRateLimitMax: fileConfig.publicRateLimitMax ?? 120,
    googleOAuthClientId: (process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim(),
    googleOAuthClientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim(),
    googleOAuthRedirectUri: normalizeOptionalUrl(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    oauthStateSecret: (process.env.OAUTH_STATE_SECRET ?? controlPlaneServiceToken).trim(),
    privyAppId: (process.env.PRIVY_APP_ID ?? '').trim(),
    privyAppSecret: (process.env.PRIVY_APP_SECRET ?? '').trim(),
    privyApiBaseUrl: normalizeOptionalUrl(process.env.PRIVY_API_BASE_URL) ?? 'https://api.privy.io',
    squadsProgramId:
      (process.env.SQUADS_V4_PROGRAM_ID ?? fileConfig.squadsProgramId ?? 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf').trim(),
    squadsDefaultVaultIndex: Number(process.env.SQUADS_DEFAULT_VAULT_INDEX ?? fileConfig.squadsDefaultVaultIndex ?? 0),
    squadsDefaultTimelockSeconds: Number(
      process.env.SQUADS_DEFAULT_TIMELOCK_SECONDS ?? fileConfig.squadsDefaultTimelockSeconds ?? 0,
    ),
    squadsProgramTreasury: normalizeOptionalText(process.env.SQUADS_PROGRAM_TREASURY ?? fileConfig.squadsProgramTreasury),
  };

  validateConfig(nextConfig);
  return nextConfig;
}

export function getSolanaNetwork(): SolanaNetwork {
  const raw = (process.env.SOLANA_NETWORK ?? 'mainnet').trim().toLowerCase();
  if (raw !== 'devnet' && raw !== 'mainnet') {
    throw new Error(`Invalid SOLANA_NETWORK="${raw}". Use 'devnet' or 'mainnet'.`);
  }
  return raw;
}

function defaultSolanaRpcUrl(network: SolanaNetwork) {
  return network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
}

function loadApiFileConfig(): FileConfig {
  const explicitPath = process.env.DECIMAL_API_CONFIG_PATH?.trim();
  const candidates = [
    explicitPath,
    path.resolve(process.cwd(), 'config/api.config.json'),
    path.resolve(process.cwd(), '../config/api.config.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config/api.config.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const raw = fs.readFileSync(candidate, 'utf8');
    return JSON.parse(raw) as FileConfig;
  }

  return {};
}

function normalizeStringArray(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeOptionalUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}

function validateConfig(nextConfig: DecimalConfig) {
  const hasPartialGoogleOAuthConfig =
    Boolean(nextConfig.googleOAuthClientId) !== Boolean(nextConfig.googleOAuthClientSecret);
  if (hasPartialGoogleOAuthConfig) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be configured together.');
  }

  if (nextConfig.googleOAuthClientId && !nextConfig.oauthStateSecret) {
    throw new Error('OAUTH_STATE_SECRET is required when Google OAuth is enabled.');
  }

  const hasPartialPrivyConfig = Boolean(nextConfig.privyAppId) !== Boolean(nextConfig.privyAppSecret);
  if (hasPartialPrivyConfig) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be configured together.');
  }

  if (nextConfig.privyApiBaseUrl.includes('/jwks') || nextConfig.privyApiBaseUrl.includes('/apps/')) {
    throw new Error('PRIVY_API_BASE_URL must be the Privy REST API base URL, usually https://api.privy.io, not a JWKS endpoint.');
  }

  if (!Number.isInteger(nextConfig.squadsDefaultVaultIndex) || nextConfig.squadsDefaultVaultIndex < 0 || nextConfig.squadsDefaultVaultIndex > 255) {
    throw new Error('SQUADS_DEFAULT_VAULT_INDEX must be an integer between 0 and 255.');
  }

  if (
    !Number.isInteger(nextConfig.squadsDefaultTimelockSeconds)
    || nextConfig.squadsDefaultTimelockSeconds < 0
    || nextConfig.squadsDefaultTimelockSeconds > 7_776_000
  ) {
    throw new Error('SQUADS_DEFAULT_TIMELOCK_SECONDS must be an integer between 0 and 7776000.');
  }

  if (!nextConfig.isProduction) {
    return;
  }

  if (nextConfig.corsOrigins.length === 0) {
    throw new Error('config/api.config.json must define at least one CORS origin in production.');
  }

  if (!nextConfig.controlPlaneServiceToken) {
    throw new Error('CONTROL_PLANE_SERVICE_TOKEN is required in production.');
  }

  if (!nextConfig.publicApiUrl) {
    throw new Error('config/api.config.json must define publicApiUrl in production.');
  }

  if (!nextConfig.publicFrontendUrl) {
    throw new Error('config/api.config.json must define publicFrontendUrl in production.');
  }

}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}
