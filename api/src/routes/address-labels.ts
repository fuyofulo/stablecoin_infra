import { Router } from 'express';
import { z } from 'zod';
import type { AddressLabel } from '@prisma/client';

import { prisma } from '../prisma.js';

export const addressLabelsRouter = Router();

const listQuerySchema = z.object({
  chain: z.string().default('solana'),
  search: z.string().trim().min(1).optional(),
});

const createAddressLabelSchema = z.object({
  chain: z.string().default('solana'),
  address: z.string().trim().min(1),
  entityName: z.string().trim().min(1),
  entityType: z.string().trim().min(1),
  labelKind: z.string().trim().min(1),
  roleTags: z.array(z.string().trim().min(1)).default([]),
  source: z.string().trim().min(1).default('manual'),
  sourceRef: z.string().trim().min(1).optional(),
  confidence: z.enum(['seeded', 'verified', 'operator', 'unverified']).default('operator'),
  isActive: z.boolean().default(true),
  notes: z.string().trim().min(1).optional(),
});

const updateAddressLabelSchema = createAddressLabelSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
);

const paramsSchema = z.object({
  addressLabelId: z.string().uuid(),
});

addressLabelsRouter.get('/address-labels', async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);

    const items = await prisma.addressLabel.findMany({
      where: {
        chain: query.chain,
        ...(query.search
          ? {
              OR: [
                { address: { contains: query.search, mode: 'insensitive' } },
                { entityName: { contains: query.search, mode: 'insensitive' } },
                { entityType: { contains: query.search, mode: 'insensitive' } },
                { labelKind: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { entityName: 'asc' }, { address: 'asc' }],
    });

    res.json({
      items: items.map(serializeAddressLabel),
    });
  } catch (error) {
    next(error);
  }
});

addressLabelsRouter.post('/address-labels', async (req, res, next) => {
  try {
    const input = createAddressLabelSchema.parse(req.body);

    const item = await prisma.addressLabel.upsert({
      where: {
        chain_address: {
          chain: input.chain,
          address: input.address,
        },
      },
      update: {
        entityName: input.entityName,
        entityType: input.entityType,
        labelKind: input.labelKind,
        roleTags: input.roleTags,
        source: input.source,
        sourceRef: input.sourceRef,
        confidence: input.confidence,
        isActive: input.isActive,
        notes: input.notes,
      },
      create: {
        chain: input.chain,
        address: input.address,
        entityName: input.entityName,
        entityType: input.entityType,
        labelKind: input.labelKind,
        roleTags: input.roleTags,
        source: input.source,
        sourceRef: input.sourceRef,
        confidence: input.confidence,
        isActive: input.isActive,
        notes: input.notes,
      },
    });

    res.status(201).json(serializeAddressLabel(item));
  } catch (error) {
    next(error);
  }
});

addressLabelsRouter.patch('/address-labels/:addressLabelId', async (req, res, next) => {
  try {
    const { addressLabelId } = paramsSchema.parse(req.params);
    const input = updateAddressLabelSchema.parse(req.body);

    const item = await prisma.addressLabel.update({
      where: { addressLabelId },
      data: {
        ...(input.chain === undefined ? {} : { chain: input.chain }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.entityName === undefined ? {} : { entityName: input.entityName }),
        ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
        ...(input.labelKind === undefined ? {} : { labelKind: input.labelKind }),
        ...(input.roleTags === undefined ? {} : { roleTags: input.roleTags }),
        ...(input.source === undefined ? {} : { source: input.source }),
        ...(input.sourceRef === undefined ? {} : { sourceRef: input.sourceRef }),
        ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
    });

    res.json(serializeAddressLabel(item));
  } catch (error) {
    next(error);
  }
});

function serializeAddressLabel(item: AddressLabel) {
  return {
    addressLabelId: item.addressLabelId,
    chain: item.chain,
    address: item.address,
    entityName: item.entityName,
    entityType: item.entityType,
    labelKind: item.labelKind,
    roleTags: normalizeRoleTags(item.roleTags),
    source: item.source,
    sourceRef: item.sourceRef,
    confidence: item.confidence,
    isActive: item.isActive,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function normalizeRoleTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
