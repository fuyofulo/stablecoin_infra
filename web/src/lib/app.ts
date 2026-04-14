import type { OrganizationMembership } from '../types';
import { startTransition } from 'react';

export type Route =
  | { name: 'landingEditorial' }
  | { name: 'login' }
  | { name: 'dashboard' }
  | { name: 'setup' }
  | { name: 'profile' }
  | { name: 'orgs' }
  | { name: 'organizationHome'; organizationId: string }
  | { name: 'workspaceHome'; workspaceId: string }
  | { name: 'workspaceCommandCenter'; workspaceId: string }
  | { name: 'workspacePayments'; workspaceId: string }
  | { name: 'workspacePaymentDetail'; workspaceId: string; paymentOrderId: string }
  | { name: 'workspaceRuns'; workspaceId: string }
  | { name: 'workspaceRunDetail'; workspaceId: string; paymentRunId: string }
  | { name: 'workspaceApprovals'; workspaceId: string }
  | { name: 'workspaceExecution'; workspaceId: string }
  | { name: 'workspaceSettlement'; workspaceId: string }
  | { name: 'workspaceProofs'; workspaceId: string }
  | { name: 'workspaceRegistry'; workspaceId: string }
  | { name: 'workspacePolicy'; workspaceId: string }
  | { name: 'workspaceRequests'; workspaceId: string }
  | { name: 'workspaceExceptions'; workspaceId: string }
  | { name: 'workspaceOps'; workspaceId: string };
export type Theme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'usdc_ops.theme';

export function formatRawUsdc(amountRaw: string) {
  const negative = amountRaw.startsWith('-');
  const digits = negative ? amountRaw.slice(1) : amountRaw;
  const padded = digits.padStart(7, '0');
  const whole = padded.slice(0, -6) || '0';
  const fraction = padded.slice(-6);

  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function formatRawUsdcCompact(amountRaw: string) {
  const normalized = formatRawUsdc(amountRaw);
  if (!normalized.includes('.')) {
    return normalized;
  }

  const [whole, fraction] = normalized.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction.length ? `${whole}.${trimmedFraction}` : whole;
}

export function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimestampCompact(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absMs < minute) {
    return formatter.format(Math.round(diffMs / 1000), 'second');
  }
  if (absMs < hour) {
    return formatter.format(Math.round(diffMs / minute), 'minute');
  }
  if (absMs < day) {
    return formatter.format(Math.round(diffMs / hour), 'hour');
  }

  return formatter.format(Math.round(diffMs / day), 'day');
}

export function shortenAddress(value: string | null | undefined, prefix = 6, suffix = 6) {
  if (!value) {
    return 'Unknown';
  }

  if (value.length <= prefix + suffix + 1) {
    return value;
  }

  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export function orbTransactionUrl(signature: string) {
  return `https://orbmarkets.io/tx/${signature}?tab=summary`;
}

export function solanaAccountUrl(address: string) {
  return `https://explorer.solana.com/address/${address}`;
}

export function parseRoute(pathname: string): Route {
  if (pathname === '/landing/editorial') return { name: 'landingEditorial' };
  if (pathname === '/landing/brand-film') return { name: 'landingEditorial' };
  if (pathname === '/login') return { name: 'login' };
  if (pathname === '/setup') return { name: 'setup' };
  if (pathname === '/profile') return { name: 'profile' };
  if (pathname === '/orgs') return { name: 'orgs' };

  const organizationMatch = pathname.match(/^\/orgs\/([0-9a-f-]+)$/i);
  if (organizationMatch) {
    return { name: 'organizationHome', organizationId: organizationMatch[1] };
  }

  const paymentDetailMatch = pathname.match(/^\/workspaces\/([0-9a-f-]+)\/payments\/([0-9a-f-]+)$/i);
  if (paymentDetailMatch) {
    const [, workspaceId, paymentOrderId] = paymentDetailMatch;
    return { name: 'workspacePaymentDetail', workspaceId, paymentOrderId };
  }

  const runDetailMatch = pathname.match(/^\/workspaces\/([0-9a-f-]+)\/runs\/([0-9a-f-]+)$/i);
  if (runDetailMatch) {
    const [, workspaceId, paymentRunId] = runDetailMatch;
    return { name: 'workspaceRunDetail', workspaceId, paymentRunId };
  }

  const workspaceMatch = pathname.match(/^\/workspaces\/([0-9a-f-]+)\/(home|command|payments|runs|approvals|execution|settlement|proofs|setup|registry|policy|requests|exceptions|ops)$/i);
  if (workspaceMatch) {
    const [, workspaceId, page] = workspaceMatch;
    if (page === 'home') return { name: 'workspaceHome', workspaceId };
    if (page === 'command') return { name: 'workspaceCommandCenter', workspaceId };
    if (page === 'payments') return { name: 'workspacePayments', workspaceId };
    if (page === 'runs') return { name: 'workspaceRuns', workspaceId };
    if (page === 'approvals') return { name: 'workspaceApprovals', workspaceId };
    if (page === 'execution') return { name: 'workspaceExecution', workspaceId };
    if (page === 'settlement') return { name: 'workspaceSettlement', workspaceId };
    if (page === 'proofs') return { name: 'workspaceProofs', workspaceId };
    if (page === 'policy') return { name: 'workspacePolicy', workspaceId };
    if (page === 'requests') return { name: 'workspaceRequests', workspaceId };
    if (page === 'exceptions') return { name: 'workspaceExceptions', workspaceId };
    if (page === 'ops') return { name: 'workspaceOps', workspaceId };
    return { name: 'workspaceRegistry', workspaceId };
  }

  return { name: 'dashboard' };
}

export function routeToPath(route: Route) {
  switch (route.name) {
    case 'landingEditorial':
      return '/landing/editorial';
    case 'login':
      return '/login';
    case 'dashboard':
      return '/';
    case 'setup':
      return '/setup';
    case 'profile':
      return '/profile';
    case 'orgs':
      return '/orgs';
    case 'organizationHome':
      return `/orgs/${route.organizationId}`;
    case 'workspaceHome':
      return `/workspaces/${route.workspaceId}/home`;
    case 'workspaceCommandCenter':
      return `/workspaces/${route.workspaceId}/command`;
    case 'workspacePayments':
      return `/workspaces/${route.workspaceId}/payments`;
    case 'workspacePaymentDetail':
      return `/workspaces/${route.workspaceId}/payments/${route.paymentOrderId}`;
    case 'workspaceRuns':
      return `/workspaces/${route.workspaceId}/runs`;
    case 'workspaceRunDetail':
      return `/workspaces/${route.workspaceId}/runs/${route.paymentRunId}`;
    case 'workspaceApprovals':
      return `/workspaces/${route.workspaceId}/approvals`;
    case 'workspaceExecution':
      return `/workspaces/${route.workspaceId}/execution`;
    case 'workspaceSettlement':
      return `/workspaces/${route.workspaceId}/settlement`;
    case 'workspaceProofs':
      return `/workspaces/${route.workspaceId}/proofs`;
    case 'workspaceRegistry':
      return `/workspaces/${route.workspaceId}/registry`;
    case 'workspacePolicy':
      return `/workspaces/${route.workspaceId}/policy`;
    case 'workspaceRequests':
      return `/workspaces/${route.workspaceId}/requests`;
    case 'workspaceExceptions':
      return `/workspaces/${route.workspaceId}/exceptions`;
    case 'workspaceOps':
      return `/workspaces/${route.workspaceId}/ops`;
  }
}

export function navigate(route: Route, setRoute: (route: Route) => void, replace = false) {
  const nextPath = routeToPath(route);
  startTransition(() => {
    setRoute(route);
  });

  if (replace) {
    window.history.replaceState(null, '', nextPath);
  } else if (window.location.pathname !== nextPath) {
    window.history.pushState(null, '', nextPath);
  }
}

export function loadTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function findOrganization(session: { organizations: OrganizationMembership[] } | null, organizationId: string) {
  if (!session) {
    return null;
  }

  return session.organizations.find((organization) => organization.organizationId === organizationId) ?? null;
}

export function findWorkspace(session: { organizations: OrganizationMembership[] } | null, workspaceId: string) {
  if (!session) {
    return null;
  }

  for (const organization of session.organizations) {
    const workspace = organization.workspaces.find((candidate) => candidate.workspaceId === workspaceId);
    if (workspace) {
      return workspace;
    }
  }

  return null;
}

export function findOrganizationForWorkspace(session: { organizations: OrganizationMembership[] } | null, workspaceId: string) {
  if (!session) {
    return null;
  }

  for (const organization of session.organizations) {
    if (organization.workspaces.some((workspace) => workspace.workspaceId === workspaceId)) {
      return organization;
    }
  }

  return null;
}

export function isAdminRole(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function countWorkspaces(organizations: OrganizationMembership[]) {
  return organizations.reduce((sum, organization) => sum + organization.workspaces.length, 0);
}
