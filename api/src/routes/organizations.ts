import { Router } from 'express';
import { z } from 'zod';
import { forbidden } from '../api-errors.js';
import { prisma } from '../prisma.js';

export const organizationsRouter = Router();

const orgParamsSchema = z.object({
  organizationId: z.string().uuid(),
});

const createOrganizationSchema = z.object({
  organizationName: z.string().min(1),
});

async function assertOrganizationNameAvailable(organizationName: string) {
  const existing = await prisma.organization.findFirst({
    where: {
      organizationName: {
        equals: organizationName,
        mode: 'insensitive',
      },
    },
    select: { organizationId: true },
  });

  if (existing) {
    throw new Error(`Organization name "${organizationName}" already exists`);
  }
}

organizationsRouter.get('/organizations', async (req, res, next) => {
  try {
    // Scoped to the current user's memberships. We intentionally do not expose
    // a directory of other organizations — users only see what they belong to.
    const items = await prisma.organization.findMany({
      where: {
        memberships: {
          some: {
            userId: req.auth!.userId,
            status: 'active',
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      items: items.map((organization) => ({
        organizationId: organization.organizationId,
        organizationName: organization.organizationName,
        status: organization.status,
        isMember: true,
      })),
    });
  } catch (error) {
    next(error);
  }
});

organizationsRouter.post('/organizations', async (req, res, next) => {
  try {
    assertVerifiedEmail(req.auth!.userEmailVerifiedAt);
    const input = createOrganizationSchema.parse(req.body);
    const organizationName = input.organizationName.trim();
    await assertOrganizationNameAvailable(organizationName);

    const organization = await prisma.$transaction(async (tx) => {
      const createdOrganization = await tx.organization.create({
        data: {
          organizationName,
        },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: createdOrganization.organizationId,
          userId: req.auth!.userId,
          role: 'owner',
        },
      });

      return createdOrganization;
    });

    res.status(201).json({
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
      role: 'owner',
      status: organization.status,
    });
  } catch (error) {
    next(error);
  }
});

organizationsRouter.post('/organizations/:organizationId/join', async (req, res, next) => {
  try {
    assertVerifiedEmail(req.auth!.userEmailVerifiedAt);
    const { organizationId } = orgParamsSchema.parse(req.params);

    const organization = await prisma.organization.findUnique({
      where: { organizationId },
    });

    if (!organization) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Organization not found',
      });
      return;
    }

    const membership = await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId,
          userId: req.auth!.userId,
        },
      },
      update: {
        status: 'active',
      },
      create: {
        organizationId,
        userId: req.auth!.userId,
        role: 'member',
        status: 'active',
      },
    });

    res.status(201).json({
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
      role: membership.role,
      status: organization.status,
    });
  } catch (error) {
    next(error);
  }
});

function assertVerifiedEmail(emailVerifiedAt: string | null) {
  if (!emailVerifiedAt) {
    throw forbidden('Email verification is required before joining or creating an organization.');
  }
}
