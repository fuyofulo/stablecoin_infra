import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from './api';
import { GridBackdrop, CenteredState } from './components/ui';
import {
  findOrganizationForWorkspace,
  findOrganization,
  findWorkspace,
  isAdminRole,
  loadTheme,
  navigate,
  parseRoute,
  THEME_STORAGE_KEY,
  type Route,
  type Theme,
} from './lib/app';
import { signAndSubmitPreparedPayment } from './lib/solana-wallet';
import {
  DashboardPage,
  LoginScreen,
  OrganizationPage,
  OrganizationsPage,
  ProfilePage,
} from './screens/general-pages';
import { AppSidebar } from './components/sidebar';
import { LandingEditorialPage } from './screens/landing-editorial';
import {
  WorkspaceHomePage,
  WorkspaceExceptionsPage,
  WorkspaceOpsPage,
  WorkspaceProofsPage,
  WorkspaceSettlementPage,
  WorkspacePolicyPage,
  WorkspaceRegistryPage,
  WorkspaceRequestsPage,
} from './screens/workspace-pages';
import type {
  ApprovalInboxItem,
  ApprovalPolicy,
  AuthenticatedSession,
  Counterparty,
  Destination,
  ExportJob,
  ExceptionItem,
  OpsHealth,
  ObservedTransfer,
  PaymentExecutionPreparation,
  PaymentExecutionPacket,
  PaymentOrder,
  Payee,
  PaymentRequest,
  PaymentRun,
  PaymentRunExecutionPreparation,
  ReconciliationDetail,
  ReconciliationRow,
  TransferRequest,
  WorkspaceAddress,
  WorkspaceMember,
} from './types';

type AuthStatus = 'booting' | 'anonymous' | 'authenticated';
const WORKSPACE_STATIC_REFRESH_INTERVAL_MS = 10_000;
const RECONCILIATION_LIVE_REFRESH_INTERVAL_MS = 2_000;

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function resetViewport(sectionId?: string) {
  if (!sectionId) {
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  window.setTimeout(() => {
    window.location.hash = sectionId;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

export function App() {
  const [theme] = useState<Theme>(() => loadTheme());
  const [authStatus, setAuthStatus] = useState<AuthStatus>('booting');
  const [session, setSession] = useState<AuthenticatedSession | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [addresses, setAddresses] = useState<WorkspaceAddress[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [paymentRuns, setPaymentRuns] = useState<PaymentRun[]>([]);
  const [transferRequests, setTransferRequests] = useState<TransferRequest[]>([]);
  const [observedTransfers, setObservedTransfers] = useState<ObservedTransfer[]>([]);
  const [reconciliationRows, setReconciliationRows] = useState<ReconciliationRow[]>([]);
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy | null>(null);
  const [approvalInbox, setApprovalInbox] = useState<ApprovalInboxItem[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [opsHealth, setOpsHealth] = useState<OpsHealth | null>(null);
  const [reconciliationFilter, setReconciliationFilter] = useState<
    ReconciliationRow['requestDisplayState'] | 'all'
  >('all');
  const [reconciliationStatusFilter, setReconciliationStatusFilter] = useState<string | 'all'>('all');
  const [selectedObservedTransfer, setSelectedObservedTransfer] = useState<ObservedTransfer | null>(null);
  const [selectedReconciliationId, setSelectedReconciliationId] = useState<string | null>(null);
  const [selectedReconciliationDetail, setSelectedReconciliationDetail] = useState<ReconciliationDetail | null>(null);
  const [isLoadingReconciliationDetail, setIsLoadingReconciliationDetail] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentWorkspaceId =
    route.name === 'workspaceHome'
    || route.name === 'workspaceCommandCenter'
    || route.name === 'workspacePayments'
    || route.name === 'workspacePaymentDetail'
    || route.name === 'workspaceRuns'
    || route.name === 'workspaceRunDetail'
    || route.name === 'workspaceApprovals'
    || route.name === 'workspaceExecution'
    || route.name === 'workspaceSettlement'
    || route.name === 'workspaceProofs'
    || route.name === 'workspaceRegistry'
    || route.name === 'workspacePolicy'
    || route.name === 'workspaceRequests'
    || route.name === 'workspaceExceptions'
    || route.name === 'workspaceOps'
      ? route.workspaceId
      : null;

  const currentWorkspace = currentWorkspaceId ? findWorkspace(session, currentWorkspaceId) : null;
  const currentWorkspaceOrganization = currentWorkspace ? findOrganizationForWorkspace(session, currentWorkspace.workspaceId) : null;
  const currentOrganization =
    route.name === 'organizationHome'
      ? findOrganization(session, route.organizationId)
      : currentWorkspaceOrganization;
  const currentDashboardOrganizationId =
    currentWorkspaceOrganization?.organizationId ?? currentOrganization?.organizationId ?? null;
  const currentRole = currentWorkspaceOrganization?.role ?? currentOrganization?.role ?? null;
  const canManageCurrentOrg = isAdminRole(currentRole);
  const sidebarWorkspace = currentWorkspace ?? currentOrganization?.workspaces[0] ?? null;
  const workspaceContexts = session
    ? session.organizations.flatMap((organization) => organization.workspaces.map((workspace) => ({ organization, workspace })))
    : [];
  const paymentsIncompleteCount = paymentOrders.filter((order) => !['settled', 'closed', 'cancelled'].includes(order.derivedState)).length;
  const approvalPendingCount = paymentOrders.filter((order) => order.derivedState === 'pending_approval').length;
  const executionQueueCount = paymentOrders.filter((order) => ['approved', 'ready_for_execution', 'execution_recorded', 'partially_settled', 'exception'].includes(order.derivedState)).length;

  useEffect(() => {
    const onPopstate = () => {
      setRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener('popstate', onPopstate);
    void boot();

    return () => {
      window.removeEventListener('popstate', onPopstate);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentWorkspaceId) {
      resetWorkspaceState();
      return;
    }

    void loadWorkspace(currentWorkspaceId);
  }, [authStatus, currentWorkspaceId]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentWorkspaceId) {
      return;
    }

    void Promise.all([
      loadObservedTransfersData(currentWorkspaceId),
      loadReconciliationData(currentWorkspaceId),
    ]);
  }, [authStatus, currentWorkspaceId, reconciliationFilter, reconciliationStatusFilter]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated'
      || !currentWorkspaceId
      || (
        route.name !== 'workspaceHome'
        && route.name !== 'workspaceCommandCenter'
        && route.name !== 'workspaceSettlement'
        && route.name !== 'workspaceRequests'
        && route.name !== 'workspacePayments'
        && route.name !== 'workspacePaymentDetail'
        && route.name !== 'workspaceRuns'
        && route.name !== 'workspaceRunDetail'
        && route.name !== 'workspaceApprovals'
        && route.name !== 'workspaceExecution'
      )
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadWorkspaceStaticData(currentWorkspaceId, { silent: true });
    }, WORKSPACE_STATIC_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authStatus, currentWorkspaceId, route.name]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated'
      || !currentWorkspaceId
      || (
        route.name !== 'workspaceHome'
        && route.name !== 'workspaceCommandCenter'
        && route.name !== 'workspaceSettlement'
        && route.name !== 'workspaceRequests'
        && route.name !== 'workspacePayments'
        && route.name !== 'workspacePaymentDetail'
        && route.name !== 'workspaceRuns'
        && route.name !== 'workspaceRunDetail'
        && route.name !== 'workspaceApprovals'
        && route.name !== 'workspaceExecution'
      )
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void Promise.all([
        loadObservedTransfersData(currentWorkspaceId, { silent: true }),
        loadReconciliationData(currentWorkspaceId, { silent: true }),
        (
          route.name === 'workspaceRequests'
          || route.name === 'workspacePayments'
          || route.name === 'workspacePaymentDetail'
          || route.name === 'workspaceRuns'
          || route.name === 'workspaceRunDetail'
          || route.name === 'workspaceApprovals'
          || route.name === 'workspaceExecution'
        )
          ? loadPaymentOrdersData(currentWorkspaceId)
          : Promise.resolve(),
      ]);
    }, RECONCILIATION_LIVE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    authStatus,
    currentWorkspaceId,
    route.name,
    reconciliationFilter,
    reconciliationStatusFilter,
    selectedReconciliationId,
  ]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated'
      || !currentWorkspaceId
      || (route.name !== 'workspaceExceptions' && route.name !== 'workspaceOps' && route.name !== 'workspaceProofs')
    ) {
      return;
    }

    void loadExceptionData(currentWorkspaceId);
  }, [authStatus, currentWorkspaceId, route.name]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !currentWorkspaceId || (route.name !== 'workspaceOps' && route.name !== 'workspaceProofs')) {
      return;
    }

    void loadOpsData(currentWorkspaceId);
  }, [authStatus, currentWorkspaceId, route.name]);

  function resetWorkspaceState() {
    setAddresses([]);
    setCounterparties([]);
    setDestinations([]);
    setPayees([]);
    setPaymentRequests([]);
    setPaymentOrders([]);
    setPaymentRuns([]);
    setTransferRequests([]);
    setObservedTransfers([]);
    setReconciliationRows([]);
    setApprovalPolicy(null);
    setApprovalInbox([]);
    setWorkspaceMembers([]);
    setExceptions([]);
    setExportJobs([]);
    setOpsHealth(null);
    setSelectedObservedTransfer(null);
    setSelectedReconciliationId(null);
    setSelectedReconciliationDetail(null);
  }

  async function boot() {
    const currentRoute = parseRoute(window.location.pathname);
    if (!api.getSessionToken()) {
      setAuthStatus('anonymous');
      if (
        currentRoute.name !== 'landingEditorial' &&
        currentRoute.name !== 'login'
      ) {
        navigate({ name: 'landingEditorial' }, setRoute, true);
      }
      return;
    }

    try {
      const nextSession = await api.getSession();
      setSession(nextSession);
      setAuthStatus('authenticated');

      if (
        parseRoute(window.location.pathname).name === 'login' ||
        parseRoute(window.location.pathname).name === 'landingEditorial'
      ) {
        navigate({ name: 'dashboard' }, setRoute, true);
      }
    } catch {
      api.clearSessionToken();
      setSession(null);
      setAuthStatus('anonymous');
      if (
        currentRoute.name !== 'landingEditorial' &&
        currentRoute.name !== 'login'
      ) {
        navigate({ name: 'landingEditorial' }, setRoute, true);
      }
    }
  }

  async function refreshSession() {
    const nextSession = await api.getSession();
    setSession(nextSession);
    return nextSession;
  }

  async function loadReconciliationDetail(
    workspaceId: string,
    transferRequestId: string,
    options?: { silent?: boolean },
  ) {
    try {
      if (!options?.silent) {
        setIsLoadingReconciliationDetail(true);
      }
      const detail = await api.getReconciliationDetail(workspaceId, transferRequestId);
      setSelectedReconciliationDetail(detail);
      setSelectedReconciliationId(transferRequestId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load request detail');
    } finally {
      if (!options?.silent) {
        setIsLoadingReconciliationDetail(false);
      }
    }
  }

  async function loadWorkspaceStaticData(workspaceId: string, options?: { silent?: boolean }) {
    try {
      setErrorMessage(null);
      if (!options?.silent) {
        setIsLoadingWorkspace(true);
      }

      const [
        nextAddresses,
        nextCounterparties,
        nextDestinations,
        nextPayees,
        nextPaymentRequests,
        nextPaymentOrders,
        nextPaymentRuns,
        nextTransferRequests,
        nextApprovalPolicy,
        nextWorkspaceMembers,
      ] = await Promise.all([
        api.listAddresses(workspaceId),
        api.listCounterparties(workspaceId),
        api.listDestinations(workspaceId),
        api.listPayees(workspaceId),
        api.listPaymentRequests(workspaceId),
        api.listPaymentOrders(workspaceId),
        api.listPaymentRuns(workspaceId),
        api.listTransferRequests(workspaceId),
        api.getApprovalPolicy(workspaceId),
        api.listWorkspaceMembers(workspaceId),
      ]);

      setAddresses(nextAddresses.items);
      setCounterparties(nextCounterparties.items);
      setDestinations(nextDestinations.items);
      setPayees(nextPayees.items);
      setPaymentRequests(nextPaymentRequests.items);
      setPaymentOrders(nextPaymentOrders.items);
      setPaymentRuns(nextPaymentRuns.items);
      setTransferRequests(nextTransferRequests.items);
      setApprovalPolicy(nextApprovalPolicy);
      setWorkspaceMembers(nextWorkspaceMembers.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load workspace');
    } finally {
      if (!options?.silent) {
        setIsLoadingWorkspace(false);
      }
    }
  }

  async function loadPaymentOrdersData(workspaceId: string) {
    try {
      setErrorMessage(null);
      const [nextPaymentRequests, nextPaymentOrders, nextPaymentRuns] = await Promise.all([
        api.listPaymentRequests(workspaceId),
        api.listPaymentOrders(workspaceId),
        api.listPaymentRuns(workspaceId),
      ]);
      setPaymentRequests(nextPaymentRequests.items);
      setPaymentOrders(nextPaymentOrders.items);
      setPaymentRuns(nextPaymentRuns.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load payment orders');
    }
  }

  async function loadObservedTransfersData(workspaceId: string, _options?: { silent?: boolean }) {
    try {
      setErrorMessage(null);
      const nextTransfers = await api.listTransfers(workspaceId);
      setObservedTransfers(nextTransfers.items);

      if (
        selectedObservedTransfer &&
        !nextTransfers.items.some((transfer) => transfer.transferId === selectedObservedTransfer.transferId)
      ) {
        setSelectedObservedTransfer(null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load observed transfers');
    }
  }

  async function loadReconciliationData(workspaceId: string, options?: { silent?: boolean }) {
    try {
      setErrorMessage(null);
      const [filteredReconciliation, nextApprovalInbox] = await Promise.all([
        api.listReconciliationQueueWithStatus(workspaceId, {
          displayState: reconciliationFilter === 'all' ? undefined : reconciliationFilter,
          requestStatus: reconciliationStatusFilter === 'all' ? undefined : reconciliationStatusFilter,
        }),
        api.listApprovalInbox(workspaceId),
      ]);
      setReconciliationRows(filteredReconciliation.items);
      setApprovalInbox(nextApprovalInbox.items);
      setApprovalPolicy(nextApprovalInbox.approvalPolicy);

      if (
        selectedReconciliationId &&
        !filteredReconciliation.items.some((row) => row.transferRequestId === selectedReconciliationId)
      ) {
        setSelectedReconciliationId(null);
        setSelectedReconciliationDetail(null);
        return;
      }

      if (selectedReconciliationId) {
        await loadReconciliationDetail(workspaceId, selectedReconciliationId, {
          silent: options?.silent ?? true,
        });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load reconciliation queue');
    }
  }

  async function loadExceptionData(workspaceId: string) {
    try {
      setErrorMessage(null);
      const nextExceptions = await api.listExceptionsFiltered(workspaceId);
      setExceptions(nextExceptions.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load exceptions');
    }
  }

  async function loadOpsData(workspaceId: string) {
    try {
      setErrorMessage(null);
      const [nextOpsHealth, nextExportJobs] = await Promise.all([
        api.getOpsHealth(workspaceId),
        api.listExportJobs(workspaceId),
      ]);
      setOpsHealth(nextOpsHealth);
      setExportJobs(nextExportJobs.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load operations status');
    }
  }

  async function loadWorkspace(workspaceId: string) {
    await Promise.all([
      loadWorkspaceStaticData(workspaceId),
      loadObservedTransfersData(workspaceId),
      loadReconciliationData(workspaceId),
      loadExceptionData(workspaceId),
      ...((route.name === 'workspaceOps' || route.name === 'workspaceProofs') ? [loadOpsData(workspaceId)] : []),
    ]);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '').trim();
    const displayName = String(formData.get('displayName') ?? '').trim();

    if (!email) {
      return;
    }

    try {
      setErrorMessage(null);
      const response = await api.login({
        email,
        displayName: displayName || undefined,
      });

      api.setSessionToken(response.sessionToken);
      setSession({
        authenticated: true,
        user: response.user,
        organizations: response.organizations,
      });
      setAuthStatus('authenticated');
      form.reset();
      navigate({ name: 'dashboard' }, setRoute);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to login');
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }

    api.clearSessionToken();
    setSession(null);
    resetWorkspaceState();
    setAuthStatus('anonymous');
    navigate({ name: 'landingEditorial' }, setRoute);
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const organizationName = String(formData.get('organizationName') ?? '').trim();

    if (!organizationName) {
      return;
    }

    try {
      setErrorMessage(null);
      const organization = await api.createOrganization({
        organizationName,
      });

      await refreshSession();
      form.reset();
      navigate({ name: 'organizationHome', organizationId: organization.organizationId }, setRoute);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create organization');
    }
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentOrganization) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const workspaceName = String(formData.get('workspaceName') ?? '').trim();

    if (!workspaceName) {
      return;
    }

    try {
      setErrorMessage(null);
      const workspace = await api.createWorkspace(currentOrganization.organizationId, {
        workspaceName,
      });

      await refreshSession();
      form.reset();
      navigate({ name: 'workspaceHome', workspaceId: workspace.workspaceId }, setRoute);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create workspace');
    }
  }

  async function handleCreateDemoWorkspace() {
    if (!currentOrganization) {
      return;
    }

    try {
      setErrorMessage(null);
      const workspace = await api.createDemoWorkspace(currentOrganization.organizationId);
      await refreshSession();
      navigate({ name: 'workspaceHome', workspaceId: workspace.workspaceId }, setRoute);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create demo workspace');
    }
  }

  async function handleCreateAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const address = String(formData.get('address') ?? '').trim();
    const displayName = String(formData.get('displayName') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();
    if (!address) return;

    try {
      setErrorMessage(null);
      await api.createAddress(currentWorkspaceId, {
        address,
        displayName: displayName || undefined,
        notes: notes || undefined,
      });
      form.reset();
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create address');
    }
  }

  async function handleUpdateAddress(
    workspaceAddressId: string,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const address = String(formData.get('address') ?? '').trim();
    const displayName = String(formData.get('displayName') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();
    const isActive = String(formData.get('isActive') ?? '').trim() !== 'false';
    if (!address) return;

    try {
      setErrorMessage(null);
      await api.updateAddress(currentWorkspaceId, workspaceAddressId, {
        address,
        displayName: displayName || undefined,
        notes: notes || undefined,
        isActive,
      });
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update address');
    }
  }

  async function handleCreatePaymentOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const sourceWorkspaceAddressId = String(formData.get('sourceWorkspaceAddressId') ?? '').trim();
    const destinationId = String(formData.get('destinationId') ?? '').trim();
    const amountRaw = String(formData.get('amountRaw') ?? '').trim();
    const reason = String(formData.get('reason') ?? '').trim();
    const memo = String(formData.get('memo') ?? '').trim();
    const externalReference = String(formData.get('externalReference') ?? '').trim();
    const invoiceNumber = String(formData.get('invoiceNumber') ?? '').trim();
    const attachmentUrl = String(formData.get('attachmentUrl') ?? '').trim();
    const dueAt = String(formData.get('dueAt') ?? '').trim();
    const sourceBalanceRaw = String(formData.get('sourceBalanceRaw') ?? '').trim();
    const submitNow = String(formData.get('submitNow') ?? '') === 'true';
    const requestReason = reason || memo || externalReference || 'Payment request';
    if (!destinationId || !amountRaw || !requestReason) return;

    try {
      setErrorMessage(null);
      await api.createPaymentRequest(currentWorkspaceId, {
        sourceWorkspaceAddressId: sourceWorkspaceAddressId || undefined,
        destinationId,
        amountRaw,
        reason: requestReason,
        externalReference: externalReference || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        metadataJson: {
          ...(invoiceNumber ? { invoiceNumber } : {}),
          ...(attachmentUrl ? { attachmentUrl } : {}),
          ...(memo && memo !== requestReason ? { memo } : {}),
          ...(sourceBalanceRaw
            ? {
                sourceBalanceSnapshot: {
                  balanceRaw: sourceBalanceRaw,
                  capturedAt: new Date().toISOString(),
                  source: 'manual_operator_snapshot',
                },
              }
            : {}),
        },
        createOrderNow: true,
        submitOrderNow: submitNow,
      });
      form.reset();
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create payment order');
    }
  }

  async function handleSubmitPaymentOrder(paymentOrderId: string) {
    if (!currentWorkspaceId) return;

    try {
      setErrorMessage(null);
      const order = await api.submitPaymentOrder(currentWorkspaceId, paymentOrderId);
      await Promise.all([
        loadWorkspace(currentWorkspaceId),
        order.transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, order.transferRequestId, { silent: true })
          : Promise.resolve(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit payment order');
    }
  }

  async function handleCancelPaymentOrder(paymentOrderId: string) {
    if (!currentWorkspaceId) return;

    try {
      setErrorMessage(null);
      await api.cancelPaymentOrder(currentWorkspaceId, paymentOrderId);
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to cancel payment order');
    }
  }

  async function handleDeletePaymentRun(paymentRunId: string) {
    if (!currentWorkspaceId) return;

    try {
      setErrorMessage(null);
      await api.deletePaymentRun(currentWorkspaceId, paymentRunId);
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete payment run');
    }
  }

  async function handleCreatePaymentOrderExecution(paymentOrderId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const executionSource = String(formData.get('executionSource') ?? '').trim();
    const externalReference = String(formData.get('externalReference') ?? '').trim();

    try {
      setErrorMessage(null);
      await api.createPaymentOrderExecution(currentWorkspaceId, paymentOrderId, {
        executionSource: executionSource || 'manual_signature',
        externalReference: externalReference || undefined,
      });
      form.reset();
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create payment order execution');
    }
  }

  async function handlePreparePaymentOrderExecution(
    paymentOrderId: string,
    input?: { sourceWorkspaceAddressId?: string },
  ): Promise<PaymentExecutionPreparation | null> {
    if (!currentWorkspaceId) return null;

    try {
      setErrorMessage(null);
      const prepared = await api.preparePaymentOrderExecution(currentWorkspaceId, paymentOrderId, input);
      await Promise.all([
        loadWorkspace(currentWorkspaceId),
        prepared.paymentOrder.transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, prepared.paymentOrder.transferRequestId, { silent: true })
          : Promise.resolve(),
      ]);
      return prepared;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to prepare payment execution');
      return null;
    }
  }

  async function handleAttachPaymentOrderSignature(paymentOrderId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submittedSignature = String(formData.get('submittedSignature') ?? '').trim();
    const externalReference = String(formData.get('externalReference') ?? '').trim();
    if (!submittedSignature && !externalReference) return;

    try {
      setErrorMessage(null);
      await api.attachPaymentOrderSignature(currentWorkspaceId, paymentOrderId, {
        submittedSignature: submittedSignature || undefined,
        externalReference: externalReference || undefined,
        submittedAt: submittedSignature ? new Date().toISOString() : undefined,
      });
      form.reset();
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to attach payment order execution');
    }
  }

  async function handleSignPreparedPaymentOrder(
    paymentOrderId: string,
    packet: PaymentExecutionPacket,
    walletOptionId?: string,
  ): Promise<string | null> {
    if (!currentWorkspaceId) return null;

    try {
      setErrorMessage(null);
      const signature = await signAndSubmitPreparedPayment(packet, walletOptionId);
      await api.attachPaymentOrderSignature(currentWorkspaceId, paymentOrderId, {
        submittedSignature: signature,
        submittedAt: new Date().toISOString(),
        metadataJson: {
          signedVia: 'browser_wallet',
          preparedExecutionRecordId: packet.executionRecordId,
        },
      });
      await loadWorkspace(currentWorkspaceId);
      return signature;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to sign and submit payment');
      throw error;
    }
  }

  async function handlePreparePaymentRunExecution(
    paymentRunId: string,
    input?: { sourceWorkspaceAddressId?: string },
  ): Promise<PaymentRunExecutionPreparation | null> {
    if (!currentWorkspaceId) return null;

    try {
      setErrorMessage(null);
      const prepared = await api.preparePaymentRunExecution(currentWorkspaceId, paymentRunId, input);
      await loadWorkspace(currentWorkspaceId);
      return prepared;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to prepare payment run execution');
      return null;
    }
  }

  async function handleSignPreparedPaymentRun(
    paymentRunId: string,
    packet: PaymentExecutionPacket,
    walletOptionId?: string,
  ): Promise<string | null> {
    if (!currentWorkspaceId) return null;

    try {
      setErrorMessage(null);
      const signature = await signAndSubmitPreparedPayment(packet, walletOptionId);
      await api.attachPaymentRunSignature(currentWorkspaceId, paymentRunId, {
        submittedSignature: signature,
        submittedAt: new Date().toISOString(),
      });
      await loadWorkspace(currentWorkspaceId);
      return signature;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to sign and submit payment run');
      throw error;
    }
  }

  async function handleCreateCounterparty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = String(formData.get('displayName') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const externalReference = String(formData.get('externalReference') ?? '').trim();
    if (!displayName) return;

    try {
      setErrorMessage(null);
      await api.createCounterparty(currentWorkspaceId, {
        displayName,
        category: category || undefined,
        externalReference: externalReference || undefined,
      });
      form.reset();
      await loadWorkspaceStaticData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create counterparty');
    }
  }

  async function handleUpdateCounterparty(
    counterpartyId: string,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = String(formData.get('displayName') ?? '').trim();
    const category = String(formData.get('category') ?? '').trim();
    const externalReference = String(formData.get('externalReference') ?? '').trim();
    const status = String(formData.get('status') ?? '').trim();
    if (!displayName) return;

    try {
      setErrorMessage(null);
      await api.updateCounterparty(currentWorkspaceId, counterpartyId, {
        displayName,
        category: category || undefined,
        externalReference: externalReference || undefined,
        status: status || undefined,
      });
      await loadWorkspaceStaticData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update counterparty');
    }
  }

  async function handleCreateDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const linkedWorkspaceAddressId = String(formData.get('linkedWorkspaceAddressId') ?? '').trim();
    const counterpartyId = String(formData.get('counterpartyId') ?? '').trim();
    const label = String(formData.get('label') ?? '').trim();
    const destinationType = String(formData.get('destinationType') ?? '').trim();
    const trustState = String(formData.get('trustState') ?? '').trim() as Destination['trustState'];
    const notes = String(formData.get('notes') ?? '').trim();
    const isInternal = String(formData.get('isInternal') ?? '').trim() === 'true';
    if (!linkedWorkspaceAddressId || !label) return;

    try {
      setErrorMessage(null);
      await api.createDestination(currentWorkspaceId, {
        linkedWorkspaceAddressId,
        counterpartyId: counterpartyId || undefined,
        label,
        destinationType: destinationType || undefined,
        trustState: trustState || undefined,
        notes: notes || undefined,
        isInternal,
      });
      form.reset();
      await loadWorkspaceStaticData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create destination');
    }
  }

  async function handleCreatePayee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get('name') ?? '').trim();
    const defaultDestinationId = String(formData.get('defaultDestinationId') ?? '').trim();
    const externalReference = String(formData.get('externalReference') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();
    if (!name) return;

    try {
      setErrorMessage(null);
      await api.createPayee(currentWorkspaceId, {
        name,
        defaultDestinationId: defaultDestinationId || null,
        externalReference: externalReference || null,
        notes: notes || null,
      });
      form.reset();
      await loadWorkspaceStaticData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create payee');
    }
  }

  async function handleUpdateDestination(
    destinationId: string,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!currentWorkspaceId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const linkedWorkspaceAddressId = String(formData.get('linkedWorkspaceAddressId') ?? '').trim();
    const counterpartyId = String(formData.get('counterpartyId') ?? '').trim();
    const label = String(formData.get('label') ?? '').trim();
    const destinationType = String(formData.get('destinationType') ?? '').trim();
    const trustState = String(formData.get('trustState') ?? '').trim() as Destination['trustState'];
    const notes = String(formData.get('notes') ?? '').trim();
    const isInternal = String(formData.get('isInternal') ?? '').trim() === 'true';
    const isActive = String(formData.get('isActive') ?? '').trim() !== 'false';
    if (!linkedWorkspaceAddressId || !label) return;

    try {
      setErrorMessage(null);
      await api.updateDestination(currentWorkspaceId, destinationId, {
        linkedWorkspaceAddressId,
        counterpartyId: counterpartyId || null,
        label,
        destinationType: destinationType || undefined,
        trustState: trustState || undefined,
        notes: notes || undefined,
        isInternal,
        isActive,
      });
      await loadWorkspace(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update destination');
    }
  }

  function handleSelectObservedTransfer(transfer: ObservedTransfer) {
    setSelectedObservedTransfer(transfer);
  }

  async function handleSelectReconciliation(row: ReconciliationRow) {
    if (!currentWorkspaceId) {
      return;
    }

    await loadReconciliationDetail(currentWorkspaceId, row.transferRequestId);
  }

  async function handleRefreshWorkspace() {
    if (!currentWorkspaceId) {
      return;
    }

    await loadWorkspace(currentWorkspaceId);
  }

  async function handleTransitionRequest(transferRequestId: string, toStatus: string) {
    if (!currentWorkspaceId || !selectedReconciliationDetail) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.transitionTransferRequest(currentWorkspaceId, transferRequestId, {
        toStatus,
        linkedSignature: selectedReconciliationDetail.linkedSignature ?? undefined,
        linkedPaymentId: selectedReconciliationDetail.linkedPaymentId ?? undefined,
        linkedTransferIds: selectedReconciliationDetail.linkedTransferIds,
        payloadJson: {
          source: 'workspace_reconciliation_detail',
        },
      });
      await Promise.all([
        loadWorkspace(currentWorkspaceId),
        loadReconciliationDetail(currentWorkspaceId, transferRequestId),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update request state');
    }
  }

  async function handleApprovalDecision(
    transferRequestId: string,
    action: 'approve' | 'reject' | 'escalate',
    comment?: string,
  ) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.createApprovalDecision(currentWorkspaceId, transferRequestId, {
        action,
        comment: comment?.trim() ? comment.trim() : undefined,
      });
      await Promise.all([
        loadWorkspace(currentWorkspaceId),
        selectedReconciliationId === transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, transferRequestId)
          : Promise.resolve(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to record approval decision');
    }
  }

  async function handleCreateExecutionRecord(transferRequestId: string) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.createExecutionRecord(currentWorkspaceId, transferRequestId, {
        executionSource: 'manual_operator',
      });
      await Promise.all([
        loadWorkspace(currentWorkspaceId),
        selectedReconciliationId === transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, transferRequestId)
          : Promise.resolve(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create execution record');
    }
  }

  async function handleUpdateExecutionRecord(
    executionRecordId: string,
    input: {
      submittedSignature?: string;
      state?: 'ready_for_execution' | 'submitted_onchain' | 'broadcast_failed';
    },
    transferRequestId: string,
  ) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.updateExecutionRecord(currentWorkspaceId, executionRecordId, input);
      await Promise.all([
        loadWorkspace(currentWorkspaceId),
        selectedReconciliationId === transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, transferRequestId)
          : Promise.resolve(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update execution record');
    }
  }

  async function handleUpdateApprovalPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId || !approvalPolicy) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      setErrorMessage(null);
      await api.updateApprovalPolicy(currentWorkspaceId, {
        policyName: String(formData.get('policyName') ?? '').trim() || undefined,
        isActive: formData.get('isActive') === 'on' || String(formData.get('isActive') ?? 'true') !== 'false',
        ruleJson: {
          requireTrustedDestination:
            formData.get('requireTrustedDestination') === 'on'
            || String(formData.get('requireTrustedDestination') ?? 'true') === 'true',
          requireApprovalForExternal:
            formData.get('requireApprovalForExternal') === 'on'
            || String(formData.get('requireApprovalForExternal') ?? 'false') === 'true',
          requireApprovalForInternal:
            formData.get('requireApprovalForInternal') === 'on'
            || String(formData.get('requireApprovalForInternal') ?? 'false') === 'true',
          externalApprovalThresholdRaw: String(formData.get('externalApprovalThresholdRaw') ?? '').trim() || undefined,
          internalApprovalThresholdRaw: String(formData.get('internalApprovalThresholdRaw') ?? '').trim() || undefined,
        },
      });
      await loadWorkspaceStaticData(currentWorkspaceId);
      await loadReconciliationData(currentWorkspaceId, { silent: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update approval policy');
    }
  }

  async function handleAddRequestNote(transferRequestId: string, body: string) {
    if (!currentWorkspaceId || !body.trim()) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.addTransferRequestNote(currentWorkspaceId, transferRequestId, {
        body: body.trim(),
      });
      await Promise.all([
        loadWorkspace(currentWorkspaceId),
        loadReconciliationDetail(currentWorkspaceId, transferRequestId),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add request note');
    }
  }

  async function handleAddExceptionNote(exceptionId: string, body: string, transferRequestId?: string | null) {
    if (!currentWorkspaceId || !body.trim()) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.addExceptionNote(currentWorkspaceId, exceptionId, {
        body: body.trim(),
      });
      await Promise.all([
        loadExceptionData(currentWorkspaceId),
        transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, transferRequestId, { silent: true })
          : Promise.resolve(),
        (route.name === 'workspaceOps' || route.name === 'workspaceProofs')
          ? loadOpsData(currentWorkspaceId)
          : Promise.resolve(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add exception note');
    }
  }

  async function handleApplyExceptionAction(
    exceptionId: string,
    action: 'reviewed' | 'expected' | 'dismissed' | 'reopen',
    transferRequestId?: string | null,
    note?: string,
  ) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.applyExceptionAction(currentWorkspaceId, exceptionId, {
        action,
        note: note?.trim() ? note.trim() : undefined,
      });
      await Promise.all([
        loadExceptionData(currentWorkspaceId),
        loadReconciliationData(currentWorkspaceId, { silent: true }),
        transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, transferRequestId, { silent: true })
          : Promise.resolve(),
        (route.name === 'workspaceOps' || route.name === 'workspaceProofs')
          ? loadOpsData(currentWorkspaceId)
          : Promise.resolve(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update exception');
    }
  }

  async function handleUpdateExceptionMetadata(
    exceptionId: string,
    input: {
      assignedToUserId?: string | null;
      resolutionCode?: string | null;
      severity?: 'info' | 'warning' | 'critical' | null;
      note?: string;
    },
    transferRequestId?: string | null,
  ) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.updateExceptionMetadata(currentWorkspaceId, exceptionId, input);
      await Promise.all([
        loadExceptionData(currentWorkspaceId),
        loadReconciliationData(currentWorkspaceId, { silent: true }),
        transferRequestId
          ? loadReconciliationDetail(currentWorkspaceId, transferRequestId, { silent: true })
          : Promise.resolve(),
        (route.name === 'workspaceOps' || route.name === 'workspaceProofs')
          ? loadOpsData(currentWorkspaceId)
          : Promise.resolve(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update exception metadata');
    }
  }

  async function handleDownloadReconciliationExport() {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.downloadReconciliationExport(currentWorkspaceId);
      await loadOpsData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export reconciliation data');
    }
  }

  async function handleDownloadExceptionsExport() {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.downloadExceptionsExport(currentWorkspaceId);
      await loadOpsData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export exceptions');
    }
  }

  async function handleDownloadAuditExport(transferRequestId: string) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.downloadAuditExport(currentWorkspaceId, transferRequestId);
      await loadOpsData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export audit timeline');
    }
  }

  async function handleDownloadPaymentOrderAuditExport(paymentOrderId: string) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      await api.downloadPaymentOrderAuditExport(currentWorkspaceId, paymentOrderId);
      await loadOpsData(currentWorkspaceId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export payment order audit packet');
    }
  }

  async function handleDownloadPaymentOrderProof(paymentOrderId: string) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      const proof = await api.getPaymentOrderProof(currentWorkspaceId, paymentOrderId);
      downloadJson(`payment-proof-${paymentOrderId}.json`, proof);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export payment proof');
    }
  }

  async function handleDownloadPaymentRunProof(paymentRunId: string) {
    if (!currentWorkspaceId) {
      return;
    }

    try {
      setErrorMessage(null);
      const proof = await api.getPaymentRunProof(currentWorkspaceId, paymentRunId);
      downloadJson(`payment-run-proof-${paymentRunId}.json`, proof);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export payment run proof');
    }
  }

  async function handleImportPaymentRequestsCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentWorkspaceId) return { ok: false, message: 'No workspace is selected' };
    const form = event.currentTarget;
    const formData = new FormData(form);
    const csv = String(formData.get('csv') ?? '').trim();
    const sourceWorkspaceAddressId = String(formData.get('sourceWorkspaceAddressId') ?? '').trim();
    const submitOrderNow = String(formData.get('submitOrderNow') ?? '') === 'true';
    if (!csv) return { ok: false, message: 'CSV is required' };

    try {
      setErrorMessage(null);
      const result = await api.importPaymentRunCsv(currentWorkspaceId, {
        csv,
        runName: `CSV payment run ${new Date().toLocaleDateString()}`,
        sourceWorkspaceAddressId: sourceWorkspaceAddressId || undefined,
        submitOrderNow,
      });
      if (result.importResult.failed > 0) {
        const failures = result.importResult.items
          .filter((item) => item.status === 'failed')
          .map((item) => `row ${item.rowNumber}: ${item.error ?? 'Import failed'}`)
          .join('; ');
        setErrorMessage(`Imported ${result.importResult.imported} row(s), failed ${result.importResult.failed}. ${failures}`);
        await loadWorkspace(currentWorkspaceId);
        return {
          ok: false,
          message: `Imported ${result.importResult.imported} row(s), failed ${result.importResult.failed}. ${failures}`,
        };
      }
      form.reset();
      await loadWorkspace(currentWorkspaceId);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import CSV payment requests';
      setErrorMessage(message);
      return { ok: false, message };
    }
  }

  function handleOpenOrganization(organizationId: string) {
    navigate({ name: 'organizationHome', organizationId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspace(workspaceId: string) {
    navigate({ name: 'workspaceCommandCenter', workspaceId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspaceRegistry(workspaceId: string, sectionId?: string) {
    navigate({ name: 'workspaceRegistry', workspaceId }, setRoute);
    resetViewport(sectionId);
  }

  function handleOpenWorkspacePolicy(workspaceId: string) {
    navigate({ name: 'workspacePolicy', workspaceId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspaceRequests(workspaceId: string) {
    navigate({ name: 'workspacePayments', workspaceId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspaceRuns(workspaceId: string) {
    navigate({ name: 'workspaceRuns', workspaceId }, setRoute);
    resetViewport();
  }

  function handleOpenPaymentDetail(workspaceId: string, paymentOrderId: string) {
    navigate({ name: 'workspacePaymentDetail', workspaceId, paymentOrderId }, setRoute);
    resetViewport();
  }

  function handleOpenRunDetail(workspaceId: string, paymentRunId: string) {
    navigate({ name: 'workspaceRunDetail', workspaceId, paymentRunId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspaceApprovals(workspaceId: string) {
    navigate({ name: 'workspaceApprovals', workspaceId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspaceExecution(workspaceId: string) {
    navigate({ name: 'workspaceExecution', workspaceId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspaceExceptions(workspaceId: string) {
    navigate({ name: 'workspaceExceptions', workspaceId }, setRoute);
    resetViewport();
  }

  function handleOpenWorkspaceOps(workspaceId: string) {
    navigate({ name: 'workspaceProofs', workspaceId }, setRoute);
    resetViewport();
  }

  if (authStatus === 'booting') {
    return (
      <div className="app-root">
        <GridBackdrop />
        <CenteredState title="Booting control surface" body="Checking session, organizations, and workspace context." />
      </div>
    );
  }

  if (authStatus === 'anonymous' || !session) {
    return (
      <div className="app-root app-root-public">
        <GridBackdrop />
        {route.name === 'login' ? (
          <LoginScreen errorMessage={errorMessage} onLogin={handleLogin} />
        ) : (
          <LandingEditorialPage
            onLogin={() => navigate({ name: 'login' }, setRoute)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-root">
      <GridBackdrop />
      <div className="app-shell">
        <AppSidebar
          session={session}
          workspaceContexts={workspaceContexts}
          activeWorkspaceId={currentWorkspaceId ?? undefined}
          route={route}
          paymentsIncompleteCount={paymentsIncompleteCount}
          approvalPendingCount={approvalPendingCount}
          executionQueueCount={executionQueueCount}
          onWorkspaceSwitch={handleOpenWorkspace}
          onOpenSection={(section) => {
            const workspaceId = currentWorkspaceId ?? sidebarWorkspace?.workspaceId;
            if (!workspaceId) return;
            if (section === 'command') handleOpenWorkspace(workspaceId);
            if (section === 'payments') handleOpenWorkspaceRequests(workspaceId);
            if (section === 'approvals') handleOpenWorkspaceApprovals(workspaceId);
            if (section === 'execution') handleOpenWorkspaceExecution(workspaceId);
            if (section === 'settlement') navigate({ name: 'workspaceSettlement', workspaceId }, setRoute);
            if (section === 'exceptions') handleOpenWorkspaceExceptions(workspaceId);
            if (section === 'proofs') handleOpenWorkspaceOps(workspaceId);
            if (section === 'registry') handleOpenWorkspaceRegistry(workspaceId);
            if (section === 'policy') handleOpenWorkspacePolicy(workspaceId);
          }}
          onOpenProfile={() => navigate({ name: 'profile' }, setRoute)}
          onOpenSetup={() => navigate({ name: 'setup' }, setRoute)}
          onLogout={handleLogout}
        />
        <main className="main-surface">
          <section className="main-panel">
            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            {route.name === 'dashboard' ? (
              <DashboardPage
                onGoOrgs={() => navigate({ name: 'orgs' }, setRoute)}
                onOpenOrganization={handleOpenOrganization}
                session={session}
              />
            ) : null}

            {route.name === 'orgs' ? (
              <OrganizationsPage
                onCreateOrganization={handleCreateOrganization}
                onOpenOrganization={handleOpenOrganization}
                session={session}
              />
            ) : null}

            {route.name === 'setup' ? (
              <OrganizationsPage
                onCreateOrganization={handleCreateOrganization}
                onOpenOrganization={handleOpenOrganization}
                session={session}
              />
            ) : null}

            {route.name === 'organizationHome' && currentOrganization ? (
              <OrganizationPage
                organization={currentOrganization}
                onCreateDemoWorkspace={handleCreateDemoWorkspace}
                onCreateWorkspace={handleCreateWorkspace}
                onOpenWorkspace={handleOpenWorkspace}
              />
            ) : null}

            {route.name === 'profile' ? <ProfilePage session={session} /> : null}

            {(route.name === 'workspaceHome' || route.name === 'workspaceCommandCenter') && currentWorkspace ? (
              <div className="request-detail-page">
                <div className="request-main-panel request-detail-surface">
                  <WorkspaceHomePage
                    addresses={addresses}
                    currentWorkspace={currentWorkspace}
                    currentRole={currentRole}
                    isLoading={isLoadingWorkspace}
                    paymentOrders={paymentOrders}
                    paymentRuns={paymentRuns}
                    exceptions={exceptions}
                    observedTransfers={observedTransfers}
                    onAddExceptionNote={handleAddExceptionNote}
                    onAddRequestNote={handleAddRequestNote}
                    onApplyExceptionAction={handleApplyExceptionAction}
                    onApplyApprovalDecision={handleApprovalDecision}
                    onCreateExecutionRecord={handleCreateExecutionRecord}
                    onChangeReconciliationFilter={setReconciliationFilter}
                    onDownloadAuditExport={handleDownloadAuditExport}
                    onSelectObservedTransfer={handleSelectObservedTransfer}
                    onSelectReconciliation={(row) => void handleSelectReconciliation(row)}
                    onTransitionRequest={handleTransitionRequest}
                    onUpdateExecutionRecord={handleUpdateExecutionRecord}
                    onOpenApprovals={() => handleOpenWorkspaceApprovals(currentWorkspace.workspaceId)}
                    onOpenExecution={() => handleOpenWorkspaceExecution(currentWorkspace.workspaceId)}
                    onOpenExceptions={() => handleOpenWorkspaceExceptions(currentWorkspace.workspaceId)}
                    onOpenPayments={() => handleOpenWorkspaceRequests(currentWorkspace.workspaceId)}
                    reconciliationFilter={reconciliationFilter}
                    reconciliationRows={reconciliationRows}
                    selectedReconciliationDetail={selectedReconciliationDetail}
                    selectedObservedTransfer={selectedObservedTransfer}
                    transferRequests={transferRequests}
                    isLoadingReconciliationDetail={isLoadingReconciliationDetail}
                    surface="command"
                  />
                </div>
              </div>
            ) : null}

            {route.name === 'workspaceSettlement' && currentWorkspace ? (
              <div className="request-detail-page">
                <div className="request-main-panel request-detail-surface">
                  <WorkspaceSettlementPage
                    currentWorkspace={currentWorkspace}
                    exceptions={exceptions}
                    reconciliationRows={reconciliationRows}
                    observedTransfers={observedTransfers}
                  />
                </div>
              </div>
            ) : null}

            {route.name === 'workspaceRegistry' && currentWorkspace ? (
              <div className="request-detail-page">
                <div className="request-main-panel request-detail-surface">
                  <WorkspaceRegistryPage
                    addresses={addresses}
                    canManage={canManageCurrentOrg}
                    counterparties={counterparties}
                    currentWorkspace={currentWorkspace}
                    destinations={destinations}
                    payees={payees}
                    onCreateAddress={handleCreateAddress}
                    onCreateCounterparty={handleCreateCounterparty}
                    onCreateDestination={handleCreateDestination}
                    onCreatePayee={handleCreatePayee}
                    onUpdateAddress={handleUpdateAddress}
                    onUpdateCounterparty={handleUpdateCounterparty}
                    onUpdateDestination={handleUpdateDestination}
                  />
                </div>
              </div>
            ) : null}

            {route.name === 'workspacePolicy' && currentWorkspace ? (
              <div className="request-detail-page">
                <div className="request-main-panel request-detail-surface">
                  <WorkspacePolicyPage
                    approvalPolicy={approvalPolicy}
                    canManage={canManageCurrentOrg}
                    destinations={destinations}
                    paymentOrders={paymentOrders}
                    onUpdateApprovalPolicy={handleUpdateApprovalPolicy}
                  />
                </div>
              </div>
            ) : null}

            {(route.name === 'workspaceRequests'
              || route.name === 'workspacePayments'
              || route.name === 'workspacePaymentDetail'
              || route.name === 'workspaceRuns'
              || route.name === 'workspaceRunDetail'
              || route.name === 'workspaceApprovals'
              || route.name === 'workspaceExecution') && currentWorkspace ? (
              <WorkspaceRequestsPage
                addresses={addresses}
                canManage={canManageCurrentOrg}
                currentWorkspace={currentWorkspace}
                destinations={destinations}
                onAttachPaymentOrderSignature={handleAttachPaymentOrderSignature}
                onCancelPaymentOrder={handleCancelPaymentOrder}
                onDeletePaymentRun={handleDeletePaymentRun}
                onCreatePaymentOrder={handleCreatePaymentOrder}
                onCreatePaymentOrderExecution={handleCreatePaymentOrderExecution}
                onDownloadPaymentOrderAuditExport={handleDownloadPaymentOrderAuditExport}
                onDownloadPaymentOrderProof={handleDownloadPaymentOrderProof}
                onDownloadPaymentRunProof={handleDownloadPaymentRunProof}
                onImportPaymentRequestsCsv={handleImportPaymentRequestsCsv}
                onPreparePaymentOrderExecution={handlePreparePaymentOrderExecution}
                onPreparePaymentRunExecution={handlePreparePaymentRunExecution}
                onSignPreparedPaymentOrder={handleSignPreparedPaymentOrder}
                onSignPreparedPaymentRun={handleSignPreparedPaymentRun}
                onSubmitPaymentOrder={handleSubmitPaymentOrder}
                paymentOrders={paymentOrders}
                paymentRequests={paymentRequests}
                paymentRuns={paymentRuns}
                reconciliationRows={reconciliationRows}
                focusedPaymentOrderId={route.name === 'workspacePaymentDetail' ? route.paymentOrderId : undefined}
                focusedPaymentRunId={route.name === 'workspaceRunDetail' ? route.paymentRunId : undefined}
                onOpenPaymentDetail={(paymentOrderId) => handleOpenPaymentDetail(currentWorkspace.workspaceId, paymentOrderId)}
                onOpenRunDetail={(paymentRunId) => handleOpenRunDetail(currentWorkspace.workspaceId, paymentRunId)}
                onExitDetail={() => handleOpenWorkspaceRequests(currentWorkspace.workspaceId)}
                mode={
                  route.name === 'workspaceRuns' || route.name === 'workspaceRunDetail'
                    ? 'runs'
                    : route.name === 'workspaceApprovals'
                      ? 'approvals'
                      : route.name === 'workspaceExecution'
                        ? 'execution'
                        : 'payments'
                }
              />
            ) : null}

            {route.name === 'workspaceExceptions' && currentWorkspace ? (
              <div className="request-detail-page">
                <div className="request-main-panel request-detail-surface">
                  <WorkspaceExceptionsPage
                    currentWorkspace={currentWorkspace}
                    exceptions={exceptions}
                    members={workspaceMembers}
                    onAddExceptionNote={handleAddExceptionNote}
                    onApplyExceptionAction={handleApplyExceptionAction}
                    onDownloadExceptionsExport={handleDownloadExceptionsExport}
                    onUpdateExceptionMetadata={handleUpdateExceptionMetadata}
                    reconciliationRows={reconciliationRows}
                  />
                </div>
              </div>
            ) : null}

            {route.name === 'workspaceOps' && currentWorkspace ? (
              <div className="request-detail-page">
                <div className="request-main-panel request-detail-surface">
                  <WorkspaceOpsPage
                    currentWorkspace={currentWorkspace}
                    exportJobs={exportJobs}
                    paymentOrders={paymentOrders}
                    paymentRuns={paymentRuns}
                    onDownloadExceptionsExport={handleDownloadExceptionsExport}
                    onDownloadReconciliationExport={handleDownloadReconciliationExport}
                    opsHealth={opsHealth}
                    surface="ops"
                  />
                </div>
              </div>
            ) : null}

            {route.name === 'workspaceProofs' && currentWorkspace ? (
              <div className="request-detail-page">
                <div className="request-main-panel request-detail-surface">
                  <WorkspaceProofsPage
                    paymentOrders={paymentOrders}
                    paymentRuns={paymentRuns}
                    onDownloadPaymentOrderProof={handleDownloadPaymentOrderProof}
                    onDownloadPaymentRunProof={handleDownloadPaymentRunProof}
                  />
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
