export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3100),
  clickhouseUrl: process.env.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123',
  clickhouseDatabase: process.env.CLICKHOUSE_DATABASE ?? 'usdc_ops',
  orbTagsResolveUrl: process.env.ORB_TAGS_RESOLVE_URL ?? 'https://orbmarkets.io/api/tags/resolve',
  orbTagsResolveEnabled:
    (process.env.ORB_TAGS_RESOLVE_ENABLED ??
      (process.env.NODE_ENV === 'test' ? 'false' : 'true')) === 'true',
  orbTagsResolveTimeoutMs: Number(process.env.ORB_TAGS_RESOLVE_TIMEOUT_MS ?? 2000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  controlPlaneServiceToken: process.env.CONTROL_PLANE_SERVICE_TOKEN ?? '',
};
