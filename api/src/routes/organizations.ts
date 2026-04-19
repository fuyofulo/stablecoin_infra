import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { assertOrganizationAccess } from '../workspace-access.js';
import { listResponse } from '../api-format.js';

export const organizationsRouter = Router();

const orgParamsSchema = z.object({
  organizationId: z.string().uuid(),
});

const createOrganizationSchema = z.object({
  organizationName: z.string().min(1),
});

const createWorkspaceSchema = z.object({
  workspaceName: z.string().min(1),
  status: z.string().default('active'),
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

async function assertWorkspaceNameAvailable(
  organizationId: string,
  workspaceName: string,
  excludeWorkspaceId?: string,
) {
  const existing = await prisma.workspace.findFirst({
    where: {
      organizationId,
      workspaceName: {
        equals: workspaceName,
        mode: 'insensitive',
      },
      ...(excludeWorkspaceId ? { workspaceId: { not: excludeWorkspaceId } } : {}),
    },
    select: { workspaceId: true },
  });

  if (existing) {
    throw new Error(`Workspace name "${workspaceName}" already exists in this organization`);
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
      include: {
        _count: {
          select: { workspaces: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      items: items.map((organization) => ({
        organizationId: organization.organizationId,
        organizationName: organization.organizationName,
        status: organization.status,
        workspaceCount: organization._count.workspaces,
        isMember: true,
      })),
    });
  } catch (error) {
    next(error);
  }
});

organizationsRouter.post('/organizations', async (req, res, next) => {
  try {
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
      workspaces: [],
    });
  } catch (error) {
    next(error);
  }
});

organizationsRouter.post('/organizations/:organizationId/join', async (req, res, next) => {
  try {
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

    const workspaces = await prisma.workspace.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });

    res.status(201).json({
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
      role: membership.role,
      status: organization.status,
      workspaces,
    });
  } catch (error) {
    next(error);
  }
});

organizationsRouter.get('/organizations/:organizationId/workspaces', async (req, res, next) => {
  try {
    const { organizationId } = orgParamsSchema.parse(req.params);
    await assertOrganizationAccess(organizationId, req.auth!);

    const items = await prisma.workspace.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(listResponse(items));
  } catch (error) {
    next(error);
  }
});

organizationsRouter.post('/organizations/:organizationId/workspaces', async (req, res, next) => {
  try {
    const { organizationId } = orgParamsSchema.parse(req.params);
    await assertOrganizationAccess(organizationId, req.auth!);
    const input = createWorkspaceSchema.parse(req.body);
    const workspaceName = input.workspaceName.trim();
    await assertWorkspaceNameAvailable(organizationId, workspaceName);

    const workspace = await prisma.workspace.create({
      data: {
        organizationId,
        workspaceName,
        status: input.status,
      },
    });

    res.status(201).json(workspace);
  } catch (error) {
    next(error);
  }
});
