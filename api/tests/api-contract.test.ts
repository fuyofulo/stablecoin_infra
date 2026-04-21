import assert from 'node:assert/strict';
import { test } from 'node:test';
import { API_ENDPOINTS } from '../src/api-contract.js';
import { AxoriaClient } from '../src/axoria-client.js';
import { buildOpenApiSpec } from '../src/openapi.js';

test('API contract has stable unique endpoint IDs and covers the backend surface', () => {
  const ids = API_ENDPOINTS.map((endpoint) => endpoint.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(API_ENDPOINTS.length >= 50);
  assert.ok(API_ENDPOINTS.some((endpoint) => endpoint.id === 'payment_order_proof' && endpoint.query?.format));
  assert.ok(API_ENDPOINTS.some((endpoint) => endpoint.id === 'preview_payment_run_csv' && endpoint.scope === 'workspace:read'));
  assert.ok(API_ENDPOINTS.some((endpoint) => endpoint.id === 'internal_matching_index_events' && endpoint.auth === 'service_token'));
});

test('OpenAPI spec is generated from the API contract', () => {
  const spec = buildOpenApiSpec();
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.title, 'Axoria API');
  assert.equal(spec.paths['/workspaces/{workspaceId}/payment-orders/{paymentOrderId}/proof'].get.operationId, 'payment_order_proof');
  assert.equal(spec.paths['/workspaces/{workspaceId}/payment-runs/import-csv/preview'].post.operationId, 'preview_payment_run_csv');
  assert.deepEqual(spec.paths['/health'].get.security, []);
});

test('typed Axoria client interpolates path, query, body, and auth headers', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new AxoriaClient({
    baseUrl: 'http://127.0.0.1:3100/',
    token: 'test-token',
    fetchImpl: (async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
  });

  const response = await client.request<{ ok: boolean }>('payment_order_proof', {
    path: {
      workspaceId: 'workspace-1',
      paymentOrderId: 'order-1',
    },
    query: {
      format: 'markdown',
    },
  });

  assert.equal(response.ok, true);
  assert.equal(calls[0].url, 'http://127.0.0.1:3100/workspaces/workspace-1/payment-orders/order-1/proof?format=markdown');
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer test-token');
});
