import { Router } from 'express';
import { z } from 'zod';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../workspace-access.js';
import { SOLANA_CHAIN, USDC_ASSET } from '../solana.js';
import { createWorkspaceAddress, listWorkspaceAddresses, updateWorkspaceAddress } from '../workspace-addresses.js';
import { asyncRoute, listQuerySchema, sendCreated, sendList, sendJson, unwrapItems } from '../route-helpers.js';

export const addressesRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const workspaceAddressParamsSchema = workspaceParamsSchema.extend({
  workspaceAddressId: z.string().uuid(),
});

const listAddressesQuerySchema = listQuerySchema({ defaultLimit: 100, maxLimit: 250 });

const createAddressSchema = z.object({
  chain: z.string().default(SOLANA_CHAIN),
  address: z.string().min(1),
  addressKind: z.string().min(1).optional(),
  displayName: z.string().optional(),
  assetScope: z.string().default(USDC_ASSET),
  source: z.string().default('manual'),
  sourceRef: z.string().optional(),
  notes: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

const updateAddressSchema = z.object({
  address: z.string().min(1).optional(),
  displayName: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (value) =>
    value.address !== undefined
    || value.displayName !== undefined
    || value.notes !== undefined
    || value.isActive !== undefined,
  'At least one field must be updated',
);

addressesRouter.get('/workspaces/:workspaceId/addresses', asyncRoute(async (req, res) => {
  const { workspaceId } = workspaceParamsSchema.parse(req.params);
  const query = listAddressesQuerySchema.parse(req.query);
  await assertWorkspaceAccess(workspaceId, req.auth!);
  sendList(res, unwrapItems(await listWorkspaceAddresses(workspaceId, query)), { limit: query.limit });
}));

addressesRouter.post('/workspaces/:workspaceId/addresses', asyncRoute(async (req, res) => {
  const { workspaceId } = workspaceParamsSchema.parse(req.params);
  await assertWorkspaceAdmin(workspaceId, req.auth!);
  const input = createAddressSchema.parse(req.body);
  sendCreated(res, await createWorkspaceAddress(workspaceId, input));
}));

addressesRouter.patch(
  '/workspaces/:workspaceId/addresses/:workspaceAddressId',
  asyncRoute(async (req, res) => {
    const { workspaceId, workspaceAddressId } = workspaceAddressParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = updateAddressSchema.parse(req.body);
    sendJson(res, await updateWorkspaceAddress(workspaceId, workspaceAddressId, input));
  }),
);
