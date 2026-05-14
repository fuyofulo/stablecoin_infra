import type { AccountPolicies, SignerPermission, SignerRole } from '@sqds/grid';
import { config } from '../config.js';
import { badRequest, notFound } from '../infra/api-errors.js';
import { prisma } from '../infra/prisma.js';
import { SOLANA_CHAIN, USDC_ASSET } from '../solana.js';
import { createTreasuryWallet } from '../wallets/treasury.js';
import { getGridClient, getGridRuntimeConfig, mapGridError } from './client.js';

export type GridPermissionInput = 'initiate' | 'vote' | 'execute';

export type CreateGridTreasuryAccountInput = {
  displayName?: string | null;
  memo?: string | null;
  threshold: number;
  timeLockSeconds?: number | null;
  signers: Array<{
    personalWalletId: string;
    permissions: GridPermissionInput[];
    role?: SignerRole;
  }>;
};

export async function createGridTreasuryAccount(
  organizationId: string,
  input: CreateGridTreasuryAccountInput,
) {
  const policies = await buildGridAccountPolicies(organizationId, input);

  try {
    const response = await getGridClient().createAccount({
      type: 'signers',
      policies,
      memo: input.memo?.trim() || undefined,
    });

    if (response.data.type !== 'signers') {
      throw badRequest('Grid returned a non-signers account response for a signers account request.', response.data);
    }

    const treasuryWallet = await createTreasuryWallet(organizationId, {
      chain: SOLANA_CHAIN,
      address: response.data.address,
      assetScope: USDC_ASSET,
      source: 'grid',
      sourceRef: response.data.gridUserId,
      displayName: input.displayName ?? input.memo ?? 'Grid treasury',
      properties: {
        grid: {
          provider: 'grid',
          environment: config.gridEnvironment,
          accountAddress: response.data.address,
          gridUserId: response.data.gridUserId,
          status: response.data.status ?? null,
          memo: response.data.memo ?? input.memo ?? null,
          policies: response.data.policies,
          lastResponse: response.lastResponse ?? null,
          createdVia: 'grid.createAccount',
        },
      },
    });

    return {
      provider: 'grid',
      environment: config.gridEnvironment,
      treasuryWallet,
      gridAccount: response.data,
      lastResponse: response.lastResponse ?? null,
    };
  } catch (error) {
    mapGridError(error);
  }
}

export async function getGridTreasuryAccountStatus(organizationId: string, treasuryWalletId: string) {
  const treasuryWallet = await getGridTreasuryWalletOrThrow(organizationId, treasuryWalletId);

  try {
    const response = await getGridClient().getAccount(treasuryWallet.address);
    return {
      provider: 'grid',
      environment: config.gridEnvironment,
      runtime: getGridRuntimeConfig(),
      treasuryWallet: serializeGridTreasuryWallet(treasuryWallet),
      gridAccount: stripAccountHelpers(response.data),
      lastResponse: response.lastResponse ?? null,
    };
  } catch (error) {
    mapGridError(error);
  }
}

export async function getGridTreasuryAccountBalances(organizationId: string, treasuryWalletId: string) {
  const treasuryWallet = await getGridTreasuryWalletOrThrow(organizationId, treasuryWalletId);

  try {
    const response = await getGridClient().getAccountBalances(treasuryWallet.address);
    return {
      provider: 'grid',
      environment: config.gridEnvironment,
      treasuryWallet: serializeGridTreasuryWallet(treasuryWallet),
      balances: response.data,
      lastResponse: response.lastResponse ?? null,
    };
  } catch (error) {
    mapGridError(error);
  }
}

async function buildGridAccountPolicies(
  organizationId: string,
  input: CreateGridTreasuryAccountInput,
): Promise<AccountPolicies> {
  if (input.signers.length === 0) {
    throw badRequest('At least one signer is required to create a Grid treasury account.');
  }

  const uniqueSignerIds = new Set(input.signers.map((signer) => signer.personalWalletId));
  if (uniqueSignerIds.size !== input.signers.length) {
    throw badRequest('Grid treasury signer list contains duplicate personal wallets.');
  }

  const personalWallets = await prisma.personalWallet.findMany({
    where: {
      userWalletId: { in: [...uniqueSignerIds] },
      chain: SOLANA_CHAIN,
      status: 'active',
      user: {
        memberships: {
          some: {
            organizationId,
            status: 'active',
          },
        },
      },
    },
    select: {
      userWalletId: true,
      walletAddress: true,
      provider: true,
    },
  });

  if (personalWallets.length !== uniqueSignerIds.size) {
    const foundIds = new Set(personalWallets.map((wallet) => wallet.userWalletId));
    const missing = [...uniqueSignerIds].filter((userWalletId) => !foundIds.has(userWalletId));
    throw badRequest('One or more Grid treasury signers are not active organization personal wallets.', { missing });
  }

  const walletById = new Map(personalWallets.map((wallet) => [wallet.userWalletId, wallet]));
  const signers = input.signers.map((signer) => {
    const wallet = walletById.get(signer.personalWalletId);
    if (!wallet) {
      throw badRequest('Signer wallet disappeared while building Grid policies.', { personalWalletId: signer.personalWalletId });
    }

    const permissions = mapGridPermissions(signer.permissions);
    if (permissions.length === 0) {
      throw badRequest('Each Grid treasury signer needs at least one permission.', { personalWalletId: signer.personalWalletId });
    }

    return {
      address: wallet.walletAddress,
      role: signer.role ?? 'primary',
      provider: wallet.provider ?? undefined,
      permissions,
    };
  });

  const votingSignerCount = signers.filter((signer) => signer.permissions.includes('CAN_VOTE')).length;
  if (votingSignerCount === 0) {
    throw badRequest('At least one Grid treasury signer must have vote permission.');
  }

  if (!Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > votingSignerCount) {
    throw badRequest('Grid treasury threshold must be between 1 and the number of voting signers.', {
      threshold: input.threshold,
      votingSignerCount,
    });
  }

  const timeLock = input.timeLockSeconds ?? 0;
  if (!Number.isInteger(timeLock) || timeLock < 0 || timeLock > 7_776_000) {
    throw badRequest('Grid treasury timelock must be an integer between 0 and 7776000 seconds.');
  }

  return {
    signers,
    threshold: input.threshold,
    timeLock,
  };
}

function mapGridPermissions(permissions: GridPermissionInput[]): SignerPermission[] {
  const next = new Set<SignerPermission>();
  for (const permission of permissions) {
    if (permission === 'initiate') {
      next.add('CAN_INITIATE');
    } else if (permission === 'vote') {
      next.add('CAN_VOTE');
    } else if (permission === 'execute') {
      next.add('CAN_EXECUTE');
    }
  }
  return [...next];
}

async function getGridTreasuryWalletOrThrow(organizationId: string, treasuryWalletId: string) {
  const treasuryWallet = await prisma.treasuryWallet.findFirst({
    where: {
      organizationId,
      treasuryWalletId,
    },
  });

  if (!treasuryWallet) {
    throw notFound('Treasury wallet not found.');
  }

  if (treasuryWallet.source !== 'grid') {
    throw badRequest('Treasury wallet is not managed by Grid.', {
      treasuryWalletId,
      source: treasuryWallet.source,
    });
  }

  return treasuryWallet;
}

function serializeGridTreasuryWallet(wallet: Awaited<ReturnType<typeof getGridTreasuryWalletOrThrow>>) {
  return {
    treasuryWalletId: wallet.treasuryWalletId,
    organizationId: wallet.organizationId,
    chain: wallet.chain,
    address: wallet.address,
    assetScope: wallet.assetScope,
    usdcAtaAddress: wallet.usdcAtaAddress,
    isActive: wallet.isActive,
    source: wallet.source,
    sourceRef: wallet.sourceRef,
    displayName: wallet.displayName,
    notes: wallet.notes,
    propertiesJson: wallet.propertiesJson,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

function stripAccountHelpers(account: Record<string, unknown>) {
  const { extractSignableTransaction, setExternallySignedTransaction, sign, ...serializableAccount } = account;
  return serializableAccount;
}
