import { Router } from 'express';
import { z } from 'zod';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../workspace-access.js';
import { fetchWalletBalances, SOLANA_CHAIN, USDC_ASSET } from '../solana.js';
import { getSolUsdPrice } from '../pricing.js';
import { createTreasuryWallet, listTreasuryWallets, updateTreasuryWallet } from '../treasury-wallets.js';
import { asyncRoute, listQuerySchema, sendCreated, sendList, sendJson, unwrapItems } from '../route-helpers.js';

export const treasuryWalletsRouter = Router();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const treasuryWalletParamsSchema = workspaceParamsSchema.extend({
  treasuryWalletId: z.string().uuid(),
});

const listTreasuryWalletsQuerySchema = listQuerySchema({ defaultLimit: 100, maxLimit: 250 });

const createTreasuryWalletSchema = z.object({
  chain: z.string().default(SOLANA_CHAIN),
  address: z.string().min(1),
  displayName: z.string().optional(),
  assetScope: z.string().default(USDC_ASSET),
  source: z.string().default('manual'),
  sourceRef: z.string().optional(),
  notes: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

const updateTreasuryWalletSchema = z.object({
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

treasuryWalletsRouter.get('/workspaces/:workspaceId/treasury-wallets', asyncRoute(async (req, res) => {
  const { workspaceId } = workspaceParamsSchema.parse(req.params);
  const query = listTreasuryWalletsQuerySchema.parse(req.query);
  await assertWorkspaceAccess(workspaceId, req.auth!);
  sendList(res, unwrapItems(await listTreasuryWallets(workspaceId, query)), { limit: query.limit });
}));

// Live balances from Solana RPC. Served on-demand; the frontend refreshes on a
// short interval. Callers should treat rpcError=non-null rows as "unknown".
treasuryWalletsRouter.get(
  '/workspaces/:workspaceId/treasury-wallets/balances',
  asyncRoute(async (req, res) => {
    const { workspaceId } = workspaceParamsSchema.parse(req.params);
    await assertWorkspaceAccess(workspaceId, req.auth!);
    const wallets = unwrapItems(await listTreasuryWallets(workspaceId, { limit: 250 }));
    const [items, solUsdPrice] = await Promise.all([
      Promise.all(
        wallets.map(async (wallet) => {
          const balances = await fetchWalletBalances({
            walletAddress: wallet.address,
            usdcAtaAddress: wallet.usdcAtaAddress,
          });
          return {
            treasuryWalletId: wallet.treasuryWalletId,
            address: wallet.address,
            usdcAtaAddress: wallet.usdcAtaAddress,
            displayName: wallet.displayName,
            isActive: wallet.isActive,
            ...balances,
          };
        }),
      ),
      getSolUsdPrice(),
    ]);
    res.json({
      items,
      solUsdPrice,
      priceSource: solUsdPrice === null ? null : 'binance:SOLUSDT',
      fetchedAt: new Date().toISOString(),
    });
  }),
);

treasuryWalletsRouter.post('/workspaces/:workspaceId/treasury-wallets', asyncRoute(async (req, res) => {
  const { workspaceId } = workspaceParamsSchema.parse(req.params);
  await assertWorkspaceAdmin(workspaceId, req.auth!);
  const input = createTreasuryWalletSchema.parse(req.body);
  sendCreated(res, await createTreasuryWallet(workspaceId, input));
}));

treasuryWalletsRouter.patch(
  '/workspaces/:workspaceId/treasury-wallets/:treasuryWalletId',
  asyncRoute(async (req, res) => {
    const { workspaceId, treasuryWalletId } = treasuryWalletParamsSchema.parse(req.params);
    await assertWorkspaceAdmin(workspaceId, req.auth!);
    const input = updateTreasuryWalletSchema.parse(req.body);
    sendJson(res, await updateTreasuryWallet(workspaceId, treasuryWalletId, input));
  }),
);
