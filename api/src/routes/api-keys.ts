import { Router } from 'express';
import { z } from 'zod';
import {
  DEFAULT_AGENT_SCOPES,
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
  revokeWorkspaceApiKey,
} from '../api-keys.js';
import { assertWorkspaceAdmin } from '../workspace-access.js';

export const apiKeysRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const apiKeyParamsSchema = workspaceParamsSchema.extend({
  apiKeyId: z.string().uuid(),
});

const createApiKeySchema = z.object({
  label: z.string().trim().min(1).max(120),
  role: z.enum(['agent_operator', 'agent_admin']).default('agent_operator'),
  scopes: z.array(z.string().trim().min(1).max(100)).max(50).default(DEFAULT_AGENT_SCOPES),
  expiresAt: z.string().datetime().nullable().optional(),
});

apiKeysRouter.get('/workspaces/:workspaceId/api-keys', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    requireHumanSession(req.auth);
    await assertWorkspaceAdmin(workspaceId, req.auth!);

    res.json(await listWorkspaceApiKeys(workspaceId));
  } catch (error) {
    next(error);
  }
});

apiKeysRouter.post('/workspaces/:workspaceId/api-keys', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    requireHumanSession(req.auth);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = createApiKeySchema.parse(req.body);

    const result = await createWorkspaceApiKey({
      workspaceId,
      createdByUserId: req.auth!.userId,
      label: input.label,
      role: input.role,
      scopes: input.scopes,
      expiresAt: input.expiresAt === undefined ? null : input.expiresAt ? new Date(input.expiresAt) : null,
    });

    res.status(201).json({
      ...result.apiKey,
      token: result.token,
      tokenWarning: 'Store this token now. Axoria only returns the full API key once.',
    });
  } catch (error) {
    next(error);
  }
});

apiKeysRouter.post('/workspaces/:workspaceId/api-keys/:apiKeyId/revoke', async (req, res, next) => {
  try {
    const { workspaceId, apiKeyId } = apiKeyParamsSchema.parse(req.params);
    requireHumanSession(req.auth);
    await assertWorkspaceAdmin(workspaceId, req.auth!);

    res.json(await revokeWorkspaceApiKey({ workspaceId, apiKeyId }));
  } catch (error) {
    next(error);
  }
});

apiKeysRouter.delete('/workspaces/:workspaceId/api-keys/:apiKeyId', async (req, res, next) => {
  try {
    const { workspaceId, apiKeyId } = apiKeyParamsSchema.parse(req.params);
    requireHumanSession(req.auth);
    await assertWorkspaceAdmin(workspaceId, req.auth!);

    res.json(await revokeWorkspaceApiKey({ workspaceId, apiKeyId }));
  } catch (error) {
    next(error);
  }
});

function requireHumanSession(auth: Express.Request['auth']) {
  if (!auth || auth.authType !== 'user_session') {
    throw new Error('Human workspace admin session required');
  }
}
