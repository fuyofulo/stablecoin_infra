import { API_ENDPOINTS, type ApiEndpoint } from './api-contract.js';

export function buildOpenApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const endpoint of API_ENDPOINTS) {
    const path = endpoint.path;
    paths[path] ??= {};
    paths[path][endpoint.method.toLowerCase()] = buildOperation(endpoint);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Axoria API',
      version: '0.1.0',
      description: 'API-first stablecoin payment control, reconciliation, execution handoff, and proof surface for humans and agents.',
    },
    servers: [
      {
        url: 'http://127.0.0.1:3100',
        description: 'Local development',
      },
    ],
    security: [
      { bearerAuth: [] },
      { apiKeyAuth: [] },
    ],
    tags: uniqueTags().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'User session bearer token returned by /auth/login.',
        },
        apiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Workspace API key. Required scopes are listed per operation.',
        },
        serviceToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-control-plane-token',
          description: 'Internal worker service token.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error', 'code', 'message', 'requestId'],
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            message: { type: 'string' },
            requestId: { type: 'string' },
            issues: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
        GenericObject: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  };
}

function buildOperation(endpoint: ApiEndpoint) {
  return {
    operationId: endpoint.id,
    tags: endpoint.tags,
    summary: endpoint.summary,
    description: [
      endpoint.scope ? `Required API-key scope: \`${endpoint.scope}\`.` : null,
      endpoint.auth === 'service_token' ? 'Internal worker endpoint protected by service token.' : null,
      endpoint.auth === 'public' ? 'Public endpoint.' : null,
    ].filter(Boolean).join('\n\n') || undefined,
    security: securityFor(endpoint),
    parameters: [
      ...pathParameters(endpoint.path),
      ...queryParameters(endpoint.query),
    ],
    requestBody: endpoint.requestBody
      ? {
          required: true,
          content: {
            'application/json': {
              schema: looseObjectSchema(endpoint.requestBody),
            },
          },
        }
      : undefined,
    responses: {
      '200': response('Successful response'),
      '201': response('Created'),
      '204': { description: 'No content' },
      '400': errorResponse('Bad request'),
      '401': errorResponse('Unauthorized'),
      '403': errorResponse('Forbidden'),
      '429': errorResponse('Rate limited'),
      '500': errorResponse('Unexpected server error'),
    },
    'x-axoria-auth': endpoint.auth,
    'x-required-scope': endpoint.scope,
  };
}

function securityFor(endpoint: ApiEndpoint) {
  if (endpoint.auth === 'public') {
    return [];
  }
  if (endpoint.auth === 'service_token') {
    return [{ serviceToken: [] }];
  }
  return [{ bearerAuth: [] }, { apiKeyAuth: [] }];
}

function pathParameters(path: string) {
  const matches = path.matchAll(/\{([^}]+)\}/g);
  return [...matches].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function queryParameters(query: Record<string, unknown> | undefined) {
  if (!query) {
    return [];
  }
  return Object.entries(query).map(([name, description]) => ({
    name,
    in: 'query',
    required: false,
    schema: { type: 'string' },
    description: String(description),
  }));
}

function looseObjectSchema(shape: Record<string, unknown>) {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(shape).map(([name, description]) => [
        name,
        {
          type: 'string',
          description: String(description),
        },
      ]),
    ),
    additionalProperties: true,
  };
}

function response(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/GenericObject' },
      },
      'text/csv': {
        schema: { type: 'string' },
      },
      'text/markdown': {
        schema: { type: 'string' },
      },
    },
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  };
}

function uniqueTags() {
  return [...new Set(API_ENDPOINTS.flatMap((endpoint) => endpoint.tags))].sort();
}
