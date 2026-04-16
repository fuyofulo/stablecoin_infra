import type { AuthContext } from './auth.js';
import { prisma } from './prisma.js';

const ADMIN_ROLES = new Set(['owner', 'admin']);
const API_KEY_WRITE_ROLES = new Set(['agent_operator', 'agent_admin']);

type AccessActor = string | AuthContext;

export async function getOrganizationMembership(userId: string, organizationId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  });

  if (!membership || membership.status !== 'active') {
    throw new Error('Organization not found');
  }

  return membership;
}

export async function assertOrganizationAccess(organizationId: string, actor: AccessActor) {
  if (isApiKeyAuth(actor)) {
    if (actor.organizationId !== organizationId) {
      throw new Error('Organization not found');
    }

    const organization = await prisma.organization.findUnique({
      where: { organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    return {
      organization,
      membership: {
        role: actor.role,
        status: 'active',
        userId: actor.userId,
        organizationId,
      },
    };
  }

  const userId = getUserId(actor);
  const [organization, membership] = await Promise.all([
    prisma.organization.findUnique({
      where: { organizationId },
    }),
    getOrganizationMembership(userId, organizationId),
  ]);

  if (!organization) {
    throw new Error('Organization not found');
  }

  return {
    organization,
    membership,
  };
}

export async function assertOrganizationAdmin(organizationId: string, actor: AccessActor) {
  const result = await assertOrganizationAccess(organizationId, actor);

  if (!canMutateWithRole(result.membership.role, actor)) {
    throw new Error('Admin access required');
  }

  return result;
}

export async function assertWorkspaceAccess(workspaceId: string, actor: AccessActor) {
  const workspace = await prisma.workspace.findUnique({
    where: { workspaceId },
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  if (isApiKeyAuth(actor) && actor.workspaceId !== workspaceId) {
    throw new Error('Workspace not found');
  }

  const { membership } = await assertOrganizationAccess(workspace.organizationId, actor);

  return {
    workspace,
    membership,
  };
}

export async function assertWorkspaceAdmin(workspaceId: string, actor: AccessActor) {
  const result = await assertWorkspaceAccess(workspaceId, actor);

  if (!canMutateWithRole(result.membership.role, actor)) {
    throw new Error('Admin access required');
  }

  return result;
}

export function isAdminRole(role: string | null | undefined) {
  return Boolean(role && ADMIN_ROLES.has(role));
}

function isApiKeyAuth(actor: AccessActor): actor is AuthContext & { authType: 'api_key' } {
  return typeof actor !== 'string' && actor.authType === 'api_key';
}

function getUserId(actor: AccessActor) {
  return typeof actor === 'string' ? actor : actor.userId;
}

function canMutateWithRole(role: string | null | undefined, actor: AccessActor) {
  if (!role) {
    return false;
  }

  if (isApiKeyAuth(actor)) {
    return API_KEY_WRITE_ROLES.has(role);
  }

  return ADMIN_ROLES.has(role);
}
