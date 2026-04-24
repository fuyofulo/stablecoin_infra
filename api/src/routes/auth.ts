import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError, conflict } from '../api-errors.js';
import { hashPassword, verifyPassword } from '../auth-passwords.js';
import { createSession, requireAuth } from '../auth.js';
import { prisma } from '../prisma.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

authRouter.post('/auth/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const displayName = normalizeOptionalDisplayName(input.displayName) ?? defaultDisplayName(email);

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    let user;

    if (existing) {
      if (existing.passwordHash) {
        throw conflict('An account with this email already exists.', { field: 'email' });
      }

      user = await prisma.user.update({
        where: { userId: existing.userId },
        data: {
          passwordHash,
          displayName,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
        },
      });
    }

    const session = await createSession(user.userId);
    const organizations = await listUserOrganizations(user.userId);

    res.status(201).json({
      status: 'authenticated',
      sessionToken: session.sessionToken,
      user: serializeUser(user),
      organizations,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/auth/session', requireAuth(), async (req, res, next) => {
  try {
    const auth = req.auth!;
    const organizations = await listUserOrganizations(auth.userId);

    res.json({
      authenticated: true,
      authType: auth.authType,
      user: {
        userId: auth.userId,
        email: auth.userEmail,
        displayName: auth.userDisplayName,
      },
      organizations,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const email = normalizeEmail(input.email);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user?.passwordHash) {
      throw invalidCredentialsError();
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);

    if (!passwordValid) {
      throw invalidCredentialsError();
    }

    const session = await createSession(user.userId);
    const organizations = await listUserOrganizations(user.userId);

    res.json({
      status: 'authenticated',
      sessionToken: session.sessionToken,
      user: serializeUser(user),
      organizations,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/logout', requireAuth(), async (req, res, next) => {
  try {
    const sessionTokenHash = crypto.createHash('sha256').update(req.auth!.sessionToken).digest('hex');
    await prisma.authSession.deleteMany({
      where: {
        OR: [
          { sessionToken: req.auth!.sessionToken },
          { sessionToken: sessionTokenHash },
        ],
      },
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

async function listUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      status: 'active',
    },
    include: {
      organization: {
        include: {
          workspaces: {
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((membership) => ({
    organizationId: membership.organization.organizationId,
    organizationName: membership.organization.organizationName,
    role: membership.role,
    status: membership.organization.status,
    workspaces: membership.organization.workspaces,
  }));
}

function serializeUser(user: { userId: string; email: string; displayName: string }) {
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeOptionalDisplayName(displayName?: string) {
  const trimmed = displayName?.trim();
  return trimmed?.length ? trimmed : null;
}

function defaultDisplayName(email: string) {
  return email.split('@')[0] ?? email;
}

function invalidCredentialsError() {
  return new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
}
