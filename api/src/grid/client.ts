import { GridClient, GridError } from '@sqds/grid';
import type { GridApiConfig } from '@sqds/grid';
import { config } from '../config.js';
import { ApiError, badRequest } from '../infra/api-errors.js';

let cachedGridClient: GridClient | null = null;
let cachedConfigFingerprint = '';

export function isGridConfigured() {
  return Boolean(config.gridApiKey);
}

export function getGridRuntimeConfig() {
  return {
    configured: isGridConfigured(),
    environment: config.gridEnvironment,
    appId: config.gridAppId,
    baseUrl: config.gridBaseUrl,
    timeoutMs: config.gridTimeoutMs,
    retryAttempts: config.gridRetryAttempts,
  };
}

export function getGridClient() {
  if (!config.gridApiKey) {
    throw badRequest('GRID_API_KEY is not configured on the API server.');
  }

  const gridConfig: GridApiConfig = {
    apiKey: config.gridApiKey,
    environment: config.gridEnvironment,
    baseUrl: config.gridBaseUrl ?? undefined,
    appId: config.gridAppId ?? undefined,
    timeout: config.gridTimeoutMs,
    retryAttempts: config.gridRetryAttempts,
    solanaRpcUrl: config.solanaRpcUrl,
  };

  const fingerprint = JSON.stringify({
    environment: gridConfig.environment,
    baseUrl: gridConfig.baseUrl ?? null,
    appId: gridConfig.appId ?? null,
    timeout: gridConfig.timeout,
    retryAttempts: gridConfig.retryAttempts,
    solanaRpcUrl: gridConfig.solanaRpcUrl,
  });

  if (!cachedGridClient || cachedConfigFingerprint !== fingerprint) {
    cachedGridClient = new GridClient(gridConfig);
    cachedConfigFingerprint = fingerprint;
  }

  return cachedGridClient;
}

export function mapGridError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  if (error instanceof GridError) {
    const upstreamStatus = error.statusCode ?? 502;
    const statusCode = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
    throw new ApiError(statusCode, 'grid_error', error.message, {
      gridCode: error.code,
      details: error.details,
      lastResponse: error.lastResponse,
    });
  }

  throw error;
}
