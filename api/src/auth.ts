import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { authenticateApiKey } from './api-keys.js';
import { prisma } from './prisma.js';

export type UserSessionAuthContext = {
  authType: 'user_session';
  sessionToken: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  actorType: 'user';
  actorId: string;
};

export type ApiKeyAuthContext = {
  authType: 'api_key';
  apiKeyId: string;
  apiKeyLabel: string;
  apiKeyPrefix: string;
  workspaceId: string;
  organizationId: string;
  role: string;
  scopes: string[];
  userId: string;
  userEmail: string;
  userDisplayName: string;
  actorType: 'api_key';
  actorId: string;
};

export type AuthContext = UserSessionAuthContext | ApiKeyAuthContext;

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const SESSION_TTL_DAYS = 30;

export async function authenticateRequest(authorizationHeader?: string | null) {
  const token = extractBearerToken(authorizationHeader);

  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: { sessionToken: token },
    include: {
      user: true,
    },
  });

  if (session && session.expiresAt > new Date()) {
    await prisma.authSession.update({
      where: { authSessionId: session.authSessionId },
      data: { lastSeenAt: new Date() },
    });

    return {
      authType: 'user_session',
      sessionToken: session.sessionToken,
      userId: session.userId,
      userEmail: session.user.email,
      userDisplayName: session.user.displayName,
      actorType: 'user',
      actorId: session.userId,
    } satisfies AuthContext;
  }

  const apiKey = await authenticateApiKey(token);

  if (!apiKey) {
    return null;
  }

  return {
    authType: 'api_key',
    apiKeyId: apiKey.apiKeyId,
    apiKeyLabel: apiKey.label,
    apiKeyPrefix: apiKey.keyPrefix,
    workspaceId: apiKey.workspaceId,
    organizationId: apiKey.organizationId,
    role: apiKey.role,
    scopes: Array.isArray(apiKey.scopes) ? apiKey.scopes.filter((scope): scope is string => typeof scope === 'string') : [],
    userId: apiKey.createdByUserId ?? apiKey.apiKeyId,
    userEmail: apiKey.createdByUser?.email ?? `${apiKey.keyPrefix}@api-key.axoria.local`,
    userDisplayName: apiKey.label,
    actorType: 'api_key',
    actorId: apiKey.apiKeyId,
  } satisfies AuthContext;
}

export async function createSession(userId: string, organizationId?: string) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  return prisma.authSession.create({
    data: {
      sessionToken,
      userId,
      ...(organizationId ? { organizationId } : {}),
      expiresAt,
    },
  });
}

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = await authenticateRequest(req.header('authorization'));

      if (!auth) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      req.auth = auth;

      if (auth.authType === 'api_key' && !isApiKeyPathAllowed(req.path, auth.workspaceId)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'API key is scoped to one workspace and cannot access this route',
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function extractBearerToken(header?: string | null) {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function isApiKeyPathAllowed(path: string, workspaceId: string) {
  return path === '/auth/session'
    || path === '/auth/logout'
    || path.startsWith(`/workspaces/${workspaceId}/`);
}
