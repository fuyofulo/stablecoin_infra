import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { deriveUsdcAtaForWallet, SOLANA_CHAIN, USDC_ASSET } from './solana.js';

export type CreateWorkspaceAddressInput = {
  chain?: string;
  address: string;
  addressKind?: string;
  displayName?: string | null;
  assetScope?: string;
  source?: string;
  sourceRef?: string | null;
  notes?: string | null;
  properties?: Record<string, unknown>;
};

export type UpdateWorkspaceAddressInput = {
  address?: string;
  displayName?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

export async function listWorkspaceAddresses(workspaceId: string, options?: { limit?: number }) {
  const items = await prisma.workspaceAddress.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 100,
  });

  return { items };
}

export async function createWorkspaceAddress(workspaceId: string, input: CreateWorkspaceAddressInput) {
  const displayName = normalizeOptionalText(input.displayName);
  if (displayName) {
    await assertWalletNameAvailable(workspaceId, displayName);
  }
  const addressKind = input.addressKind ?? 'wallet';
  const usdcAtaAddress = deriveUsdcAtaForWallet(input.address);

  return prisma.workspaceAddress.create({
    data: {
      workspaceId,
      chain: input.chain ?? SOLANA_CHAIN,
      address: input.address,
      addressKind,
      assetScope: input.assetScope ?? USDC_ASSET,
      usdcAtaAddress,
      source: input.source ?? 'manual',
      sourceRef: input.sourceRef,
      displayName,
      notes: normalizeOptionalText(input.notes),
      propertiesJson: {
        usdcAtaAddress,
        ...(input.properties ?? {}),
      } as Prisma.InputJsonObject,
    },
  });
}

export async function updateWorkspaceAddress(
  workspaceId: string,
  workspaceAddressId: string,
  input: UpdateWorkspaceAddressInput,
) {
  const current = await prisma.workspaceAddress.findFirstOrThrow({
    where: {
      workspaceId,
      workspaceAddressId,
    },
  });

  const nextAddress = input.address?.trim() || current.address;
  const nextUsdcAtaAddress = deriveUsdcAtaForWallet(nextAddress);
  const nextDisplayName =
    input.displayName !== undefined ? normalizeOptionalText(input.displayName) : current.displayName;

  if (nextDisplayName) {
    await assertWalletNameAvailable(workspaceId, nextDisplayName, workspaceAddressId);
  }

  return prisma.$transaction(async (tx) => {
    const address = await tx.workspaceAddress.update({
      where: { workspaceAddressId },
      data: {
        address: nextAddress,
        usdcAtaAddress: nextUsdcAtaAddress,
        displayName: nextDisplayName,
        notes: input.notes !== undefined ? normalizeOptionalText(input.notes) : undefined,
        isActive: input.isActive,
        propertiesJson: {
          ...(isRecordLike(current.propertiesJson) ? current.propertiesJson : {}),
          usdcAtaAddress: nextUsdcAtaAddress,
        } as Prisma.InputJsonObject,
      },
    });

    await tx.destination.updateMany({
      where: {
        workspaceId,
        linkedWorkspaceAddressId: workspaceAddressId,
      },
      data: {
        chain: address.chain,
        asset: address.assetScope,
        walletAddress: address.address,
        tokenAccountAddress: address.usdcAtaAddress,
      },
    });

    return address;
  });
}

async function assertWalletNameAvailable(
  workspaceId: string,
  displayName: string,
  excludeWorkspaceAddressId?: string,
) {
  const existing = await prisma.workspaceAddress.findFirst({
    where: {
      workspaceId,
      displayName: {
        equals: displayName,
        mode: 'insensitive',
      },
      ...(excludeWorkspaceAddressId ? { workspaceAddressId: { not: excludeWorkspaceAddressId } } : {}),
    },
    select: { workspaceAddressId: true },
  });

  if (existing) {
    throw new Error(`Wallet name "${displayName}" already exists in this workspace`);
  }
}

function normalizeOptionalText(value?: string | null) {
  return value?.trim() || null;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
