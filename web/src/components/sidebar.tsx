import type { ReactNode } from 'react';
import type { AuthenticatedSession, OrganizationMembership, Workspace } from '../types';
import type { Route } from '../lib/app';

type WorkspaceContext = {
  organization: OrganizationMembership;
  workspace: Workspace;
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  );
}

const icons = {
  command: (
    <Icon>
      <path
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a2 2 0 01-2 2h-4a1 1 0 01-1-1v-6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  payments: (
    <Icon>
      <path
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  approvals: (
    <Icon>
      <path
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  execution: (
    <Icon>
      <path
        d="M13 10V3L4 14h7v7l9-11h-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  settlement: (
    <Icon>
      <path
        d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  exceptions: (
    <Icon>
      <path
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  proofs: (
    <Icon>
      <path
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  address: (
    <Icon>
      <path
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  policy: (
    <Icon>
      <path
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  user: (
    <Icon>
      <path
        d="M5.121 17.804A9 9 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
  signOut: (
    <Icon>
      <path
        d="M16 17l5-5-5-5M21 12H9m4 9H6a2 2 0 01-2-2V5a2 2 0 012-2h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  ),
} as const;

function SidebarLink({
  icon,
  label,
  isActive,
  badgeCount,
  isDanger = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  badgeCount?: number;
  isDanger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sidebar-link${isActive ? ' sidebar-link-active' : ''}${isDanger ? ' sidebar-link-danger' : ''}`}
      onClick={onClick}
    >
      <span className="sidebar-link-icon-wrap">{icon}</span>
      <span className="sidebar-link-label">{label}</span>
      {badgeCount && badgeCount > 0 ? (
        <span className="sidebar-link-badge" aria-label={`${badgeCount} pending`}>
          {badgeCount}
        </span>
      ) : null}
    </button>
  );
}

function isRouteActive(route: Route, section: string) {
  if (section === 'command') return route.name === 'workspaceCommandCenter' || route.name === 'workspaceHome';
  if (section === 'payments') return route.name === 'workspacePayments' || route.name === 'workspaceRequests' || route.name === 'workspacePaymentDetail' || route.name === 'workspaceRunDetail';
  if (section === 'approvals') return route.name === 'workspaceApprovals';
  if (section === 'execution') return route.name === 'workspaceExecution';
  if (section === 'settlement') return route.name === 'workspaceSettlement';
  if (section === 'exceptions') return route.name === 'workspaceExceptions';
  if (section === 'proofs') return route.name === 'workspaceProofs' || route.name === 'workspaceOps';
  if (section === 'registry') return route.name === 'workspaceRegistry';
  if (section === 'policy') return route.name === 'workspacePolicy';
  return false;
}

export function AppSidebar({
  session,
  workspaceContexts,
  activeWorkspaceId,
  route,
  paymentsIncompleteCount,
  approvalPendingCount,
  executionQueueCount,
  onWorkspaceSwitch,
  onOpenSection,
  onOpenProfile,
  onOpenSetup,
  onLogout,
}: {
  session: AuthenticatedSession;
  workspaceContexts: WorkspaceContext[];
  activeWorkspaceId?: string;
  route: Route;
  paymentsIncompleteCount?: number;
  approvalPendingCount?: number;
  executionQueueCount?: number;
  onWorkspaceSwitch: (workspaceId: string) => void;
  onOpenSection: (section: 'command' | 'payments' | 'approvals' | 'execution' | 'settlement' | 'exceptions' | 'proofs' | 'registry' | 'policy') => void;
  onOpenProfile: () => void;
  onOpenSetup: () => void;
  onLogout: () => void;
}) {
  const activeContext = workspaceContexts.find((ctx) => ctx.workspace.workspaceId === activeWorkspaceId)
    ?? workspaceContexts[0];
  const activeWorkspace = activeContext?.workspace;

  return (
    <aside className="sidebar" aria-label="Application">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden />
        <div className="sidebar-brand-text">
          <strong>Stablecoin Ops</strong>
          <span>Payment control</span>
        </div>
      </div>

      <nav className="sidebar-scroll" aria-label="Workspace navigation">
        {workspaceContexts.length ? (
          <div className="sidebar-switcher">
            <p className="sidebar-section-label">Workspace switcher</p>
            <div className="sidebar-switcher-select-wrap">
              <select
                className="sidebar-switcher-select"
                value={activeWorkspace?.workspaceId ?? ''}
                onChange={(event) => {
                  const nextWorkspaceId = event.target.value;
                  if (!nextWorkspaceId) return;
                  onWorkspaceSwitch(nextWorkspaceId);
                }}
              >
                {workspaceContexts.map(({ organization, workspace }) => (
                  <option key={workspace.workspaceId} value={workspace.workspaceId}>
                    {organization.organizationName} / {workspace.workspaceName}
                  </option>
                ))}
              </select>
              <span className="sidebar-switcher-chevron" aria-hidden />
            </div>
            <button className="sidebar-switcher-create-link" type="button" onClick={onOpenSetup}>
              + New org/workspace
            </button>
          </div>
        ) : null}

        {activeContext ? (
          <div className="sidebar-workspace" key={activeContext.workspace.workspaceId}>
            <div className="sidebar-section">
              <p className="sidebar-section-label">Operations</p>
              <div className="sidebar-link-list" role="list">
                <SidebarLink icon={icons.command} label="Command Center" isActive={isRouteActive(route, 'command')} onClick={() => onOpenSection('command')} />
                <SidebarLink icon={icons.payments} label="Payments" isActive={isRouteActive(route, 'payments')} badgeCount={paymentsIncompleteCount} onClick={() => onOpenSection('payments')} />
                <SidebarLink icon={icons.approvals} label="Approvals" isActive={isRouteActive(route, 'approvals')} badgeCount={approvalPendingCount} onClick={() => onOpenSection('approvals')} />
                <SidebarLink icon={icons.execution} label="Execution" isActive={isRouteActive(route, 'execution')} badgeCount={executionQueueCount} onClick={() => onOpenSection('execution')} />
                <SidebarLink icon={icons.settlement} label="Settlement" isActive={isRouteActive(route, 'settlement')} onClick={() => onOpenSection('settlement')} />
                <SidebarLink icon={icons.exceptions} label="Exceptions" isActive={isRouteActive(route, 'exceptions')} onClick={() => onOpenSection('exceptions')} />
                <SidebarLink icon={icons.proofs} label="Proofs" isActive={isRouteActive(route, 'proofs')} onClick={() => onOpenSection('proofs')} />
              </div>
            </div>

            <div className="sidebar-section">
              <p className="sidebar-section-label">Administration</p>
              <div className="sidebar-link-list" role="list">
                <SidebarLink icon={icons.address} label="Address book" isActive={isRouteActive(route, 'registry')} onClick={() => onOpenSection('registry')} />
                <SidebarLink icon={icons.policy} label="Policy" isActive={isRouteActive(route, 'policy')} onClick={() => onOpenSection('policy')} />
              </div>
            </div>

          </div>
        ) : null}
      </nav>
      <div className="sidebar-footer sidebar-personal">
        <p className="sidebar-section-label">Personal</p>
        <div className="sidebar-link-list" role="list">
          <SidebarLink
            icon={icons.user}
            label={session.user.email}
            isActive={route.name === 'profile'}
            onClick={onOpenProfile}
          />
          <SidebarLink
            icon={icons.signOut}
            label="Sign out"
            isActive={false}
            isDanger
            onClick={() => void onLogout()}
          />
        </div>
      </div>
    </aside>
  );
}
