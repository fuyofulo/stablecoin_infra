import type { Counterparty, Destination, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type CreateCounterpartyInput = {
  displayName: string;
  category?: string;
  externalReference?: string | null;
  status?: string;
  metadataJson?: Prisma.InputJsonValue;
};

export type UpdateCounterpartyInput = {
  displayName?: string;
  category?: string;
  externalReference?: string | null;
  status?: string;
};

export type CreateDestinationInput = {
  counterpartyId?: string | null;
  linkedWorkspaceAddressId: string;
  destinationType?: string;
  trustState?: 'unreviewed' | 'trusted' | 'restricted' | 'blocked';
  label: string;
  notes?: string | null;
  isInternal?: boolean;
  isActive?: boolean;
  metadataJson?: Prisma.InputJsonValue;
};

export type UpdateDestinationInput = {
  counterpartyId?: string | null;
  linkedWorkspaceAddressId?: string;
  destinationType?: string;
  trustState?: 'unreviewed' | 'trusted' | 'restricted' | 'blocked';
  label?: string;
  notes?: string | null;
  isInternal?: boolean;
  isActive?: boolean;
};

export async function listCounterparties(workspaceId: string, options?: { limit?: number }) {
  const workspace = await getWorkspaceOrg(workspaceId);
  const items = await prisma.counterparty.findMany({
    where: { organizationId: workspace.organizationId },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 100,
  });

  return { items: items.map(serializeCounterparty) };
}

export async function createCounterparty(workspaceId: string, input: CreateCounterpartyInput) {
  const workspace = await getWorkspaceOrg(workspaceId);
  await assertCounterpartyNameAvailable(workspace.organizationId, input.displayName);

  const counterparty = await prisma.counterparty.create({
    data: {
      organizationId: workspace.organizationId,
      displayName: input.displayName,
      category: input.category ?? 'vendor',
      externalReference: normalizeOptionalText(input.externalReference),
      status: input.status ?? 'active',
      metadataJson: (input.metadataJson ?? {}) as Prisma.InputJsonValue,
    },
  });

  return serializeCounterparty(counterparty);
}

export async function updateCounterparty(workspaceId: string, counterpartyId: string, input: UpdateCounterpartyInput) {
  const workspace = await getWorkspaceOrg(workspaceId);
  const current = await prisma.counterparty.findFirst({
    where: {
      counterpartyId,
      organizationId: workspace.organizationId,
    },
  });

  if (!current) {
    throw new Error('Counterparty not found');
  }

  const nextDisplayName = input.displayName?.trim() || current.displayName;
  await assertCounterpartyNameAvailable(workspace.organizationId, nextDisplayName, counterpartyId);

  const updated = await prisma.counterparty.update({
    where: { counterpartyId },
    data: {
      displayName: input.displayName,
      category: input.category,
      externalReference: input.externalReference !== undefined ? normalizeOptionalText(input.externalReference) : undefined,
      status: input.status,
    },
  });

  return serializeCounterparty(updated);
}

export async function listDestinations(workspaceId: string, options?: { limit?: number }) {
  const items = await prisma.destination.findMany({
    where: { workspaceId },
    include: {
      counterparty: true,
      linkedWorkspaceAddress: true,
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 100,
  });

  return { items: items.map(serializeDestination) };
}

export async function createDestination(workspaceId: string, input: CreateDestinationInput) {
  const [workspace, linkedWorkspaceAddress] = await Promise.all([
    getWorkspaceOrg(workspaceId),
    prisma.workspaceAddress.findFirst({
      where: {
        workspaceId,
        workspaceAddressId: input.linkedWorkspaceAddressId,
        isActive: true,
      },
    }),
  ]);

  if (!linkedWorkspaceAddress) {
    throw new Error('Linked wallet not found');
  }

  if (input.counterpartyId) {
    await assertCounterpartyBelongsToOrg(workspace.organizationId, input.counterpartyId);
  }

  await assertDestinationLabelAvailable(workspaceId, input.label);

  const destination = await prisma.destination.create({
    data: {
      workspaceId,
      counterpartyId: input.counterpartyId,
      linkedWorkspaceAddressId: linkedWorkspaceAddress.workspaceAddressId,
      chain: linkedWorkspaceAddress.chain,
      asset: linkedWorkspaceAddress.assetScope,
      walletAddress: linkedWorkspaceAddress.address,
      tokenAccountAddress: linkedWorkspaceAddress.usdcAtaAddress,
      destinationType: input.destinationType ?? 'wallet',
      trustState: input.trustState ?? 'unreviewed',
      label: input.label,
      notes: normalizeOptionalText(input.notes),
      isInternal: input.isInternal ?? false,
      isActive: input.isActive ?? true,
      metadataJson: (input.metadataJson ?? {}) as Prisma.InputJsonValue,
    },
    include: {
      counterparty: true,
      linkedWorkspaceAddress: true,
    },
  });

  return serializeDestination(destination);
}

export async function updateDestination(workspaceId: string, destinationId: string, input: UpdateDestinationInput) {
  const [workspace, current] = await Promise.all([
    getWorkspaceOrg(workspaceId),
    prisma.destination.findFirstOrThrow({
      where: { workspaceId, destinationId },
    }),
  ]);

  if (input.counterpartyId) {
    await assertCounterpartyBelongsToOrg(workspace.organizationId, input.counterpartyId);
  }

  const nextLabel = input.label?.trim() || current.label;
  await assertDestinationLabelAvailable(workspaceId, nextLabel, destinationId);

  const linkedWorkspaceAddress = input.linkedWorkspaceAddressId
    ? await prisma.workspaceAddress.findFirst({
        where: {
          workspaceId,
          workspaceAddressId: input.linkedWorkspaceAddressId,
          isActive: true,
        },
      })
    : current.linkedWorkspaceAddressId
      ? await prisma.workspaceAddress.findFirst({
          where: {
            workspaceId,
            workspaceAddressId: current.linkedWorkspaceAddressId,
          },
        })
      : null;

  const updated = await prisma.destination.update({
    where: { destinationId },
    data: {
      counterpartyId: input.counterpartyId !== undefined ? input.counterpartyId : undefined,
      linkedWorkspaceAddressId: input.linkedWorkspaceAddressId ?? undefined,
      chain: linkedWorkspaceAddress?.chain ?? undefined,
      asset: linkedWorkspaceAddress?.assetScope ?? undefined,
      walletAddress: linkedWorkspaceAddress?.address ?? undefined,
      tokenAccountAddress: linkedWorkspaceAddress?.usdcAtaAddress ?? undefined,
      destinationType: input.destinationType,
      trustState: input.trustState,
      label: input.label,
      notes: input.notes !== undefined ? normalizeOptionalText(input.notes) : undefined,
      isInternal: input.isInternal,
      isActive: input.isActive,
    },
    include: {
      counterparty: true,
      linkedWorkspaceAddress: true,
    },
  });

  return serializeDestination(updated);
}

function getWorkspaceOrg(workspaceId: string) {
  return prisma.workspace.findUniqueOrThrow({
    where: { workspaceId },
    select: { organizationId: true },
  });
}

async function assertCounterpartyBelongsToOrg(organizationId: string, counterpartyId: string) {
  const counterparty = await prisma.counterparty.findFirst({
    where: {
      counterpartyId,
      organizationId,
    },
  });

  if (!counterparty) {
    throw new Error('Counterparty not found');
  }
}

async function assertCounterpartyNameAvailable(
  organizationId: string,
  displayName: string,
  excludeCounterpartyId?: string,
) {
  const existing = await prisma.counterparty.findFirst({
    where: {
      organizationId,
      displayName: {
        equals: displayName,
        mode: 'insensitive',
      },
      ...(excludeCounterpartyId ? { counterpartyId: { not: excludeCounterpartyId } } : {}),
    },
    select: { counterpartyId: true },
  });

  if (existing) {
    throw new Error(`Counterparty name "${displayName}" already exists in this organization`);
  }
}

async function assertDestinationLabelAvailable(
  workspaceId: string,
  label: string,
  excludeDestinationId?: string,
) {
  const existing = await prisma.destination.findFirst({
    where: {
      workspaceId,
      label: {
        equals: label,
        mode: 'insensitive',
      },
      ...(excludeDestinationId ? { destinationId: { not: excludeDestinationId } } : {}),
    },
    select: { destinationId: true },
  });

  if (existing) {
    throw new Error(`Destination name "${label}" already exists in this workspace`);
  }
}

function serializeCounterparty(counterparty: Counterparty) {
  return {
    counterpartyId: counterparty.counterpartyId,
    organizationId: counterparty.organizationId,
    displayName: counterparty.displayName,
    category: counterparty.category,
    externalReference: counterparty.externalReference,
    status: counterparty.status,
    metadataJson: counterparty.metadataJson,
    createdAt: counterparty.createdAt,
    updatedAt: counterparty.updatedAt,
  };
}

function serializeDestination(destination: Destination & {
  counterparty?: Counterparty | null;
  linkedWorkspaceAddress?: {
    workspaceAddressId: string;
    address: string;
    usdcAtaAddress: string | null;
    addressKind: string;
    displayName: string | null;
    notes: string | null;
  } | null;
}) {
  return {
    destinationId: destination.destinationId,
    workspaceId: destination.workspaceId,
    counterpartyId: destination.counterpartyId,
    linkedWorkspaceAddressId: destination.linkedWorkspaceAddressId,
    chain: destination.chain,
    asset: destination.asset,
    walletAddress: destination.walletAddress,
    tokenAccountAddress: destination.tokenAccountAddress,
    destinationType: destination.destinationType,
    trustState: destination.trustState,
    label: destination.label,
    notes: destination.notes,
    isInternal: destination.isInternal,
    isActive: destination.isActive,
    metadataJson: destination.metadataJson,
    createdAt: destination.createdAt,
    updatedAt: destination.updatedAt,
    counterparty: destination.counterparty ? serializeCounterparty(destination.counterparty) : null,
    linkedWorkspaceAddress: destination.linkedWorkspaceAddress
      ? {
          workspaceAddressId: destination.linkedWorkspaceAddress.workspaceAddressId,
          address: destination.linkedWorkspaceAddress.address,
          usdcAtaAddress: destination.linkedWorkspaceAddress.usdcAtaAddress,
          addressKind: destination.linkedWorkspaceAddress.addressKind,
          displayName: destination.linkedWorkspaceAddress.displayName,
          notes: destination.linkedWorkspaceAddress.notes,
        }
      : null,
  };
}

function normalizeOptionalText(value?: string | null) {
  return value?.trim() || null;
}
