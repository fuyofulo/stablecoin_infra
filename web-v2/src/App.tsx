import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  ApprovalPolicy,
  AuthenticatedSession,
  Counterparty,
  Destination,
  ExceptionItem,
  OpsHealth,
  Payee,
  PaymentExecutionPacket,
  PaymentOrder,
  PaymentOrderState,
  PaymentRequest,
  PaymentRun,
  PaymentRunExecutionPreparation,
  ReconciliationTimelineItem,
  WorkspaceAddress,
  Workspace,
} from './api';
import {
  discoverSolanaWallets,
  formatRawUsdcCompact,
  formatRelativeTime,
  formatTimestamp,
  orbTransactionUrl,
  shortenAddress,
  signAndSubmitPreparedPayment,
  solanaAccountUrl,
  subscribeSolanaWallets,
  type BrowserWalletOption,
} from './domain';

function queryKeys(workspaceId?: string, paymentOrderId?: string) {
  return {
    session: ['session'] as const,
    addresses: ['addresses', workspaceId] as const,
    counterparties: ['counterparties', workspaceId] as const,
    destinations: ['destinations', workspaceId] as const,
    payees: ['payees', workspaceId] as const,
    paymentRequests: ['payment-requests', workspaceId] as const,
    paymentRuns: ['payment-runs', workspaceId] as const,
    paymentRun: ['payment-run', workspaceId, paymentOrderId] as const,
    paymentOrders: ['payment-orders', workspaceId] as const,
    paymentOrder: ['payment-order', workspaceId, paymentOrderId] as const,
    approvalPolicy: ['approval-policy', workspaceId] as const,
    exceptions: ['exceptions', workspaceId] as const,
    opsHealth: ['ops-health', workspaceId] as const,
  };
}

export function App() {
  const sessionQuery = useQuery({
    queryKey: queryKeys().session,
    queryFn: () => api.getSession(),
    retry: false,
  });

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<RequireSession sessionQuery={sessionQuery} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireSession({
  sessionQuery,
}: {
  sessionQuery: ReturnType<typeof useQuery<AuthenticatedSession>>;
}) {
  if (sessionQuery.isLoading) {
    return <ScreenState title="Loading workspace" description="Checking your session." />;
  }

  if (!sessionQuery.data) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell session={sessionQuery.data} />;
}

function AppShell({ session }: { session: AuthenticatedSession }) {
  const workspaces = useMemo(() => getWorkspaces(session), [session]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function logout() {
    await api.logout().catch(() => undefined);
    api.clearSessionToken();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark" />
          <div>
            <strong>Stablecoin Ops</strong>
            <span>Payment control</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <NavGroup title="Workspaces">
            {workspaces.map(({ organization, workspace }) => (
              <div className="workspace-nav-block" key={workspace.workspaceId}>
                <Link className="workspace-nav-title" to={`/workspaces/${workspace.workspaceId}`}>
                  <span>{workspace.workspaceName}</span>
                  <small>{organization.organizationName}</small>
                </Link>
                <div className="workspace-nav-links">
                  <Link to={`/workspaces/${workspace.workspaceId}/runs`}>Runs</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/requests`}>Requests</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/payments`}>Payments</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/approvals`}>Approvals</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/execution`}>Execution</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/settlement`}>Settlement</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/exceptions`}>Exceptions</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/proofs`}>Proofs</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/registry`}>Address book</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/policy`}>Policy</Link>
                  <Link to={`/workspaces/${workspace.workspaceId}/ops`}>Ops health</Link>
                </div>
              </div>
            ))}
            {!workspaces.length ? <Link to="/setup"><span>Create workspace</span><small>Start in v2</small></Link> : null}
          </NavGroup>
        </nav>
        <div className="sidebar-footer">
          <span>{session.user.email}</span>
          <button className="button button-secondary button-small" onClick={() => void logout()} type="button">Logout</button>
        </div>
      </aside>
      <main className="main-surface">
        <Routes>
          <Route path="/" element={<HomeRedirect session={session} />} />
          <Route path="/setup" element={<SetupPage session={session} />} />
          <Route path="/workspaces/:workspaceId" element={<CommandCenterPage session={session} />} />
          <Route path="/workspaces/:workspaceId/registry" element={<AddressBookPage session={session} />} />
          <Route path="/workspaces/:workspaceId/requests" element={<PaymentRequestsPage session={session} />} />
          <Route path="/workspaces/:workspaceId/runs" element={<PaymentRunsPage session={session} />} />
          <Route path="/workspaces/:workspaceId/runs/:paymentRunId" element={<PaymentRunDetailPage session={session} />} />
          <Route path="/workspaces/:workspaceId/payments" element={<PaymentsPage session={session} />} />
          <Route path="/workspaces/:workspaceId/payments/:paymentOrderId" element={<PaymentDetailPage session={session} />} />
          <Route path="/workspaces/:workspaceId/approvals" element={<ApprovalsPage session={session} />} />
          <Route path="/workspaces/:workspaceId/execution" element={<ExecutionPage session={session} />} />
          <Route path="/workspaces/:workspaceId/settlement" element={<SettlementPage session={session} />} />
          <Route path="/workspaces/:workspaceId/proofs" element={<ProofsPage session={session} />} />
          <Route path="/workspaces/:workspaceId/policy" element={<PolicyPage session={session} />} />
          <Route path="/workspaces/:workspaceId/exceptions" element={<ExceptionsPage session={session} />} />
          <Route path="/workspaces/:workspaceId/ops" element={<OpsPage session={session} />} />
        </Routes>
      </main>
    </div>
  );
}

function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const loginMutation = useMutation({
    mutationFn: (email: string) => api.login({ email }),
    onSuccess: async (result) => {
      api.setSessionToken(result.sessionToken);
      await queryClient.invalidateQueries({ queryKey: queryKeys().session });
      navigate('/', { replace: true });
    },
    onError: (nextError) => {
      setError(nextError instanceof Error ? nextError.message : 'Login failed');
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    if (!email) {
      setError('Email is required.');
      return;
    }
    loginMutation.mutate(email);
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Stablecoin payment control</p>
        <h1>Run payments from request to proof.</h1>
        <p>
          A cleaner workspace for approval, execution, settlement, exceptions, and audit proof.
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input name="email" type="email" placeholder="ops@company.com" autoComplete="email" />
          </label>
          <button className="button button-primary" disabled={loginMutation.isPending} type="submit">
            {loginMutation.isPending ? 'Opening workspace...' : 'Open workspace'}
          </button>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </main>
  );
}

function HomeRedirect({ session }: { session: AuthenticatedSession }) {
  const [first] = getWorkspaces(session);
  if (!first) {
    return <Navigate to="/setup" replace />;
  }

  return <Navigate to={`/workspaces/${first.workspace.workspaceId}`} replace />;
}

function SetupPage({ session }: { session: AuthenticatedSession }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.listOrganizations(),
  });
  const createWorkspaceMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const organizationName = String(formData.get('organizationName') ?? '').trim();
      const existingOrganizationId = String(formData.get('existingOrganizationId') ?? '').trim();
      const workspaceName = String(formData.get('workspaceName') ?? '').trim();
      const useDemo = formData.get('useDemo') === 'on';
      if (!workspaceName && !useDemo) {
        throw new Error('Workspace name is required.');
      }
      const organization = existingOrganizationId
        ? session.organizations.find((candidate) => candidate.organizationId === existingOrganizationId)
        : await api.createOrganization({ organizationName });
      if (!organization) {
        throw new Error('Choose an organization or create one.');
      }
      const workspace = useDemo
        ? await api.createDemoWorkspace(organization.organizationId)
        : await api.createWorkspace(organization.organizationId, { workspaceName });
      return workspace;
    },
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys().session });
      navigate(`/workspaces/${workspace.workspaceId}`, { replace: true });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not create workspace.'),
  });

  return (
    <PageFrame
      eyebrow="Setup"
      title="Create the workspace in v2"
      description="Start with an organization and workspace. You do not need to return to the legacy app."
    >
      <div className="split-panels">
        <section className="panel">
          <SectionHeader title="New operating workspace" description="Use a real workspace name or create the demo workspace for quick testing." />
          <form className="form-grid" onSubmit={(event) => createWorkspaceMutation.mutate(event)}>
            <label className="field">
              Existing organization
              <select name="existingOrganizationId" defaultValue="">
                <option value="">Create a new organization</option>
                {session.organizations.map((organization) => (
                  <option key={organization.organizationId} value={organization.organizationId}>{organization.organizationName}</option>
                ))}
              </select>
            </label>
            <label className="field">
              New organization name
              <input name="organizationName" placeholder="Acme Treasury" />
            </label>
            <label className="field">
              Workspace name
              <input name="workspaceName" placeholder="Main stablecoin desk" />
            </label>
            <label className="field checkbox-field">
              <input name="useDemo" type="checkbox" />
              Create demo workspace
            </label>
            <button className="button button-primary" disabled={createWorkspaceMutation.isPending} type="submit">
              {createWorkspaceMutation.isPending ? 'Creating...' : 'Create workspace'}
            </button>
          </form>
          {message ? <div className="notice">{message}</div> : null}
        </section>
        <section className="panel">
          <SectionHeader title="Organizations" description="Available organizations from this session." />
          <SimpleList
            items={(organizationsQuery.data?.items ?? []).map((organization) => ({
              id: organization.organizationId,
              title: organization.organizationName,
              meta: `${organization.workspaceCount} workspace(s) / ${organization.isMember ? organization.membershipRole ?? 'member' : 'not joined'}`,
            }))}
            empty="No organizations found yet."
          />
        </section>
      </div>
    </PageFrame>
  );
}

function CommandCenterPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = findWorkspace(session, workspaceId);
  const paymentOrdersQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentOrders,
    queryFn: () => api.listPaymentOrders(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const paymentRunsQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentRuns,
    queryFn: () => api.listPaymentRuns(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const exceptionsQuery = useQuery({
    queryKey: queryKeys(workspaceId).exceptions,
    queryFn: () => api.listExceptions(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const opsHealthQuery = useQuery({
    queryKey: queryKeys(workspaceId).opsHealth,
    queryFn: () => api.getOpsHealth(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 10_000,
  });

  if (!workspaceId || !workspace) {
    return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar or create one in setup." />;
  }

  const orders = paymentOrdersQuery.data?.items ?? [];
  const runs = paymentRunsQuery.data?.items ?? [];
  const exceptions = exceptionsQuery.data?.items ?? [];
  const needsApproval = orders.filter((order) => order.derivedState === 'pending_approval');
  const ready = orders.filter((order) => order.derivedState === 'ready_for_execution');
  const unsettled = orders.filter((order) => ['execution_recorded', 'approved'].includes(order.derivedState));
  const completed = orders.filter((order) => ['settled', 'closed'].includes(order.derivedState));

  return (
    <PageFrame
      eyebrow="Command Center"
      title={workspace.workspaceName}
      description="Daily payment work across intake, approval, execution, settlement, exceptions, and proof."
      action={
        <div className="action-cluster">
          <Link className="button button-secondary" to={`/workspaces/${workspaceId}/requests`}>New request</Link>
          <Link className="button button-primary" to={`/workspaces/${workspaceId}/runs`}>Import CSV batch</Link>
        </div>
      }
    >
      <div className="metric-strip metric-strip-four">
        <Metric label="Needs approval" value={String(needsApproval.length)} />
        <Metric label="Ready to sign" value={String(ready.length)} />
        <Metric label="Waiting settlement" value={String(unsettled.length)} />
        <Metric label="Open exceptions" value={String(exceptions.filter((item) => item.status !== 'dismissed').length)} />
      </div>
      {opsHealthQuery.data && opsHealthQuery.data.workerStatus !== 'healthy' ? (
        <div className="notice">Worker health is {opsHealthQuery.data.workerStatus}. Check Ops Health before relying on live settlement.</div>
      ) : null}
      <div className="split-panels">
        <section className="panel">
          <SectionHeader title="Action queue" description="Payments where the next operator action is visible." />
          <PaymentTable workspaceId={workspaceId} paymentOrders={[...needsApproval, ...ready, ...unsettled].slice(0, 8)} />
        </section>
        <section className="panel">
          <SectionHeader title="Proof-ready payments" description="Completed payments that can be exported." />
          <PaymentTable workspaceId={workspaceId} paymentOrders={completed.slice(0, 6)} />
        </section>
      </div>
      <section className="panel panel-spaced">
        <SectionHeader title="Recent payment runs" description="Batch imports and execution packets." />
        <PaymentRunsTable workspaceId={workspaceId} runs={runs.slice(0, 8)} />
      </section>
    </PageFrame>
  );
}

function PaymentsPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = findWorkspace(session, workspaceId);
  const paymentOrdersQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentOrders,
    queryFn: () => api.listPaymentOrders(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  if (!workspaceId || !workspace) {
    return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  }

  const paymentOrders = paymentOrdersQuery.data?.items ?? [];

  return (
    <PageFrame
      eyebrow="Payments"
      title="Payment control"
      description="Review payment intent, execution, settlement, exceptions, and proof from one queue."
      action={
        <div className="action-cluster">
          <Link className="button button-secondary" to={`/workspaces/${workspaceId}/runs`}>Import CSV batch</Link>
          <Link className="button button-primary" to={`/workspaces/${workspaceId}/requests`}>New payment request</Link>
        </div>
      }
    >
      <div className="metric-strip">
        <Metric label="Needs action" value={String(paymentOrders.filter(isActionableOrder).length)} />
        <Metric label="Ready to sign" value={String(paymentOrders.filter((order) => order.derivedState === 'ready_for_execution').length)} />
        <Metric label="Completed" value={String(paymentOrders.filter((order) => order.derivedState === 'settled' || order.derivedState === 'closed').length)} />
      </div>
      <section className="panel">
        <SectionHeader title={`Payments [${paymentOrders.length}]`} description="Click a row to open the durable payment page." />
        {paymentOrdersQuery.isLoading ? (
          <EmptyState title="Loading payments" description="Fetching the payment queue." />
        ) : paymentOrders.length ? (
          <PaymentTable workspaceId={workspaceId} paymentOrders={paymentOrders} />
        ) : (
          <EmptyState title="No payments yet" description="Create a payment request or import a CSV batch to start the workflow." />
        )}
      </section>
    </PageFrame>
  );
}

function PaymentRequestsPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const requestsQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentRequests,
    queryFn: () => api.listPaymentRequests(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const ordersQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentOrders,
    queryFn: () => api.listPaymentOrders(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const destinationsQuery = useQuery({
    queryKey: queryKeys(workspaceId).destinations,
    queryFn: () => api.listDestinations(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const addressesQuery = useQuery({
    queryKey: queryKeys(workspaceId).addresses,
    queryFn: () => api.listAddresses(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const payeesQuery = useQuery({
    queryKey: queryKeys(workspaceId).payees,
    queryFn: () => api.listPayees(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const createRequestMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const destinationId = getFormString(formData, 'destinationId');
      const amount = getFormString(formData, 'amount');
      const reason = getFormString(formData, 'reason');
      if (!destinationId || !amount || !reason) {
        throw new Error('Destination, amount, and reason are required.');
      }
      return api.createPaymentRequest(workspaceId!, {
        payeeId: getOptionalFormString(formData, 'payeeId') ?? undefined,
        destinationId,
        amountRaw: usdcToRaw(amount),
        reason,
        externalReference: getOptionalFormString(formData, 'externalReference') ?? undefined,
        dueAt: normalizeDateInput(getOptionalFormString(formData, 'dueAt')),
        createOrderNow: true,
        sourceWorkspaceAddressId: getOptionalFormString(formData, 'sourceWorkspaceAddressId') ?? undefined,
        submitOrderNow: formData.get('submitOrderNow') === 'on',
      });
    },
    onSuccess: async () => {
      setMessage('Payment request created.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).paymentRequests }),
        queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).paymentOrders }),
      ]);
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not create request.'),
  });

  if (!workspaceId || !workspace) {
    return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  }

  const requests = requestsQuery.data?.items ?? [];
  const ordersByRequest = new Map((ordersQuery.data?.items ?? []).map((order) => [order.paymentRequestId, order]));
  const destinations = destinationsQuery.data?.items ?? [];
  const addresses = addressesQuery.data?.items ?? [];
  const payees = payeesQuery.data?.items ?? [];

  return (
    <PageFrame
      eyebrow="Intake"
      title="Payment requests"
      description="Create the human-facing input object, then let the order workflow handle approval, execution, settlement, and proof."
      action={<Link className="button button-secondary" to={`/workspaces/${workspaceId}/runs`}>Import CSV batch</Link>}
    >
      <div className="split-panels split-panels-wide-left">
        <section className="panel">
          <SectionHeader title={`Requests [${requests.length}]`} description="Manual requests and imported rows become controlled payment orders." />
          <PaymentRequestsTable workspaceId={workspaceId} requests={requests} ordersByRequest={ordersByRequest} />
        </section>
        <section className="panel">
          <SectionHeader title="New payment request" description="Use decimal USDC here. The app converts it to raw units for the backend." />
          <form className="form-stack" onSubmit={(event) => createRequestMutation.mutate(event)}>
            <label className="field">
              Payee
              <select name="payeeId" defaultValue="">
                <option value="">Optional</option>
                {payees.map((payee) => <option key={payee.payeeId} value={payee.payeeId}>{payee.name}</option>)}
              </select>
            </label>
            <label className="field">
              Destination
              <select name="destinationId" required defaultValue="">
                <option value="" disabled>Select destination</option>
                {destinations.filter((destination) => destination.isActive).map((destination) => (
                  <option key={destination.destinationId} value={destination.destinationId}>{destination.label} / {destination.trustState}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Source wallet
              <select name="sourceWorkspaceAddressId" defaultValue="">
                <option value="">Optional until execution</option>
                {addresses.filter((address) => address.isActive).map((address) => (
                  <option key={address.workspaceAddressId} value={address.workspaceAddressId}>{walletLabel(address)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Amount
              <input name="amount" placeholder="0.01" required />
            </label>
            <label className="field">
              Reason
              <input name="reason" placeholder="Pay Acme Corp for INV-1001" required />
            </label>
            <label className="field">
              Reference
              <input name="externalReference" placeholder="INV-1001" />
            </label>
            <label className="field">
              Due date
              <input name="dueAt" type="date" />
            </label>
            <label className="field checkbox-field">
              <input name="submitOrderNow" type="checkbox" />
              Submit into approval now
            </label>
            <button className="button button-primary" disabled={createRequestMutation.isPending || !destinations.length} type="submit">
              {createRequestMutation.isPending ? 'Creating...' : 'Create request'}
            </button>
          </form>
          {message ? <div className="notice">{message}</div> : null}
        </section>
      </div>
    </PageFrame>
  );
}

function PaymentRunsPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const runsQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentRuns,
    queryFn: () => api.listPaymentRuns(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const addressesQuery = useQuery({
    queryKey: queryKeys(workspaceId).addresses,
    queryFn: () => api.listAddresses(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const importMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const csv = getFormString(formData, 'csv');
      if (!csv) throw new Error('CSV is required.');
      return api.importPaymentRunCsv(workspaceId!, {
        csv,
        runName: getOptionalFormString(formData, 'runName') ?? undefined,
        sourceWorkspaceAddressId: getOptionalFormString(formData, 'sourceWorkspaceAddressId') ?? undefined,
        submitOrderNow: formData.get('submitOrderNow') === 'on',
      });
    },
    onSuccess: async (result) => {
      setMessage(`Imported ${result.importResult.imported} row(s).`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).paymentRuns }),
        queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).paymentRequests }),
        queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).paymentOrders }),
      ]);
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'CSV import failed.'),
  });

  if (!workspaceId || !workspace) {
    return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  }

  const runs = runsQuery.data?.items ?? [];
  const addresses = addressesQuery.data?.items ?? [];

  return (
    <PageFrame
      eyebrow="Batch Intake"
      title="Payment runs"
      description="Import CSV payout sheets, review the batch, prepare one transaction, and export run-level proof."
    >
      <div className="split-panels split-panels-wide-left">
        <section className="panel">
          <SectionHeader title={`Payment runs [${runs.length}]`} description="Each run is a durable page with its own execution and proof packet." />
          <PaymentRunsTable workspaceId={workspaceId} runs={runs} />
        </section>
        <section className="panel">
          <SectionHeader title="Import CSV batch" description="Columns: payee,destination,amount,reference,due_date." />
          <form className="form-stack" onSubmit={(event) => importMutation.mutate(event)}>
            <label className="field">
              Run name
              <input name="runName" placeholder="April contractor payouts" />
            </label>
            <label className="field">
              Source wallet
              <select name="sourceWorkspaceAddressId" defaultValue="">
                <option value="">Optional until execution</option>
                {addresses.filter((address) => address.isActive).map((address) => (
                  <option key={address.workspaceAddressId} value={address.workspaceAddressId}>{walletLabel(address)}</option>
                ))}
              </select>
            </label>
            <label className="field checkbox-field">
              <input name="submitOrderNow" type="checkbox" />
              Submit trusted rows into approval now
            </label>
            <label className="field">
              CSV
              <textarea
                name="csv"
                rows={10}
                placeholder={[
                  'payee,destination,amount,reference,due_date',
                  'Acme Corp,8cZ65A8ERdVsXq3YnEdMNimwG7DhGe1tPszysJwh43Zx,0.01,INV-1001,2026-04-15',
                ].join('\n')}
                required
              />
            </label>
            <button className="button button-primary" disabled={importMutation.isPending} type="submit">
              {importMutation.isPending ? 'Importing...' : 'Import CSV batch'}
            </button>
          </form>
          {message ? <div className="notice">{message}</div> : null}
        </section>
      </div>
    </PageFrame>
  );
}

function PaymentRunDetailPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId, paymentRunId } = useParams<{ workspaceId: string; paymentRunId: string }>();
  const queryClient = useQueryClient();
  const [prepared, setPrepared] = useState<PaymentRunExecutionPreparation | null>(null);
  const [manualSignature, setManualSignature] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const runQuery = useQuery({
    queryKey: queryKeys(workspaceId, paymentRunId).paymentRun,
    queryFn: () => api.getPaymentRunDetail(workspaceId!, paymentRunId!),
    enabled: Boolean(workspaceId && paymentRunId),
    refetchInterval: 5_000,
  });
  const prepareMutation = useMutation({
    mutationFn: () => api.preparePaymentRunExecution(workspaceId!, paymentRunId!),
    onSuccess: async (result) => {
      setPrepared(result);
      setMessage('Batch execution packet prepared.');
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId, paymentRunId).paymentRun });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not prepare run.'),
  });
  const attachMutation = useMutation({
    mutationFn: (signature: string) => api.attachPaymentRunSignature(workspaceId!, paymentRunId!, {
      submittedSignature: signature,
      submittedAt: new Date().toISOString(),
    }),
    onSuccess: async () => {
      setManualSignature('');
      setMessage('Batch signature attached.');
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId, paymentRunId).paymentRun });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not attach signature.'),
  });
  const proofMutation = useMutation({
    mutationFn: () => api.getPaymentRunProof(workspaceId!, paymentRunId!),
    onSuccess: (proof) => downloadJson(`payment-run-proof-${paymentRunId}.json`, proof),
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not export run proof.'),
  });

  if (!workspaceId || !paymentRunId || !workspace) {
    return <ScreenState title="Run unavailable" description="Choose a payment run from the runs page." />;
  }
  if (runQuery.isLoading) {
    return <ScreenState title="Loading run" description="Fetching the payment run." />;
  }
  const run = runQuery.data;
  if (!run) {
    return <ScreenState title="Run not found" description="The payment run could not be loaded." />;
  }

  return (
    <PageFrame
      eyebrow="Payment Run"
      title={run.runName}
      description={`${run.totals.orderCount} payment(s) / ${formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC / ${labelState(run.derivedState)}`}
      action={
        <div className="action-cluster">
          <button className="button button-secondary" onClick={() => prepareMutation.mutate()} disabled={prepareMutation.isPending} type="button">
            {prepareMutation.isPending ? 'Preparing...' : 'Prepare batch'}
          </button>
          <button className="button button-primary" onClick={() => proofMutation.mutate()} type="button">Export run proof</button>
        </div>
      }
    >
      <WorkflowRail steps={buildRunWorkflow(run)} />
      {message ? <div className="notice">{message}</div> : null}
      <div className="split-panels split-panels-wide-left">
        <section className="panel">
          <SectionHeader title="Run payments" description="Rows reconcile independently even when execution is prepared as one batch packet." />
          <PaymentTable workspaceId={workspaceId} paymentOrders={run.paymentOrders ?? []} />
        </section>
        <aside className="panel">
          <SectionHeader title="Batch execution" description="Attach a wallet-submitted signature after signing the prepared packet." />
          <InfoGrid items={[
            ['Source', run.sourceWorkspaceAddress ? walletLabel(run.sourceWorkspaceAddress) : 'Not set'],
            ['Ready', `${run.totals.readyCount}/${run.totals.orderCount}`],
            ['Exceptions', String(run.totals.exceptionCount)],
            ['Prepared instructions', prepared ? String(prepared.executionPacket.instructions.length) : 'Not prepared'],
          ]} />
          {prepared ? (
            <div className="packet-box">
              <InfoGrid items={[
                ['Signer', shortenAddress(prepared.executionPacket.signerWallet)],
                ['Transfers', String(prepared.executionPacket.transfers?.length ?? 0)],
                ['Amount', `${formatRawUsdcCompact(prepared.executionPacket.amountRaw)} USDC`],
                ['Instructions', String(prepared.executionPacket.instructions.length)],
              ]} />
            </div>
          ) : null}
          <div className="manual-signature manual-signature-stack">
            <label className="field">
              Submitted signature
              <input value={manualSignature} onChange={(event) => setManualSignature(event.target.value)} placeholder="Paste batch transaction signature" />
            </label>
            <button
              className="button button-secondary"
              onClick={() => manualSignature.trim() ? attachMutation.mutate(manualSignature.trim()) : setMessage('Paste a signature first.')}
              type="button"
            >
              Attach batch signature
            </button>
          </div>
        </aside>
      </div>
    </PageFrame>
  );
}

function ApprovalsPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const ordersQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentOrders,
    queryFn: () => api.listPaymentOrders(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const approvalMutation = useMutation({
    mutationFn: ({ order, action }: { order: PaymentOrder; action: 'approve' | 'reject' }) => {
      if (!order.transferRequestId) throw new Error('This payment has no linked approval request yet.');
      return api.createApprovalDecision(workspaceId!, order.transferRequestId, { action });
    },
    onSuccess: async () => {
      setMessage('Approval decision recorded.');
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).paymentOrders });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not record approval decision.'),
  });

  if (!workspaceId || !workspace) return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  const pending = (ordersQuery.data?.items ?? []).filter((order) => order.derivedState === 'pending_approval');

  return (
    <PageFrame eyebrow="Approvals" title={`Approval queue [${pending.length}]`} description="Payments blocked by policy or destination trust until a human decision is recorded.">
      {message ? <div className="notice">{message}</div> : null}
      <ActionPaymentTable
        workspaceId={workspaceId}
        paymentOrders={pending}
        actionHeader="Decision"
        emptyTitle="No approvals waiting"
        emptyDescription="Payments requiring approval will appear here."
        renderAction={(order) => (
          <span className="table-actions">
            <button className="button button-secondary button-small" onClick={() => approvalMutation.mutate({ order, action: 'approve' })} type="button">Approve</button>
            <button className="button button-secondary button-small danger-text" onClick={() => approvalMutation.mutate({ order, action: 'reject' })} type="button">Reject</button>
          </span>
        )}
      />
    </PageFrame>
  );
}

function ExecutionPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = findWorkspace(session, workspaceId);
  const ordersQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentOrders,
    queryFn: () => api.listPaymentOrders(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  if (!workspaceId || !workspace) return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  const orders = (ordersQuery.data?.items ?? []).filter((order) => ['approved', 'ready_for_execution', 'execution_recorded'].includes(order.derivedState));
  return (
    <PageFrame eyebrow="Execution" title={`Execution queue [${orders.length}]`} description="Payments that need source selection, packet preparation, signing, or settlement observation.">
      <ActionPaymentTable
        workspaceId={workspaceId}
        paymentOrders={orders}
        actionHeader="Next"
        emptyTitle="Nothing waiting for execution"
        emptyDescription="Approved or submitted payments will appear here."
        renderAction={(order) => <Link className="button button-secondary button-small" to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}`}>{getExecutionLabel(order)}</Link>}
      />
    </PageFrame>
  );
}

function SettlementPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = findWorkspace(session, workspaceId);
  const reconciliationQuery = useQuery({
    queryKey: ['settlement-reconciliation', workspaceId],
    queryFn: () => api.listReconciliation(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const transfersQuery = useQuery({
    queryKey: ['observed-transfers', workspaceId],
    queryFn: () => api.listTransfers(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  if (!workspaceId || !workspace) return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  return (
    <PageFrame eyebrow="Settlement" title="Settlement and reconciliation" description="Payment-centric chain truth first, raw observed USDC movement second.">
      <section className="panel">
        <SectionHeader title={`Reconciliation [${reconciliationQuery.data?.items.length ?? 0}]`} />
        <SimpleList
          items={(reconciliationQuery.data?.items ?? []).map((row) => ({
            id: row.transferRequestId,
            title: `${walletLabel(row.sourceWorkspaceAddress) ?? 'Source not set'} -> ${row.destination?.label ?? walletLabel(row.destinationWorkspaceAddress) ?? 'destination'}`,
            meta: `${formatRawUsdcCompact(row.amountRaw)} ${row.asset} / ${labelState(row.requestDisplayState)} / ${row.match?.signature ? shortenAddress(row.match.signature, 8, 6) : 'no signature yet'}`,
          }))}
          empty="No reconciliation rows yet."
        />
      </section>
      <section className="panel panel-spaced">
        <SectionHeader title={`Observed USDC movement [${transfersQuery.data?.items.length ?? 0}]`} />
        <SimpleList
          items={(transfersQuery.data?.items ?? []).map((transfer) => ({
            id: transfer.transferId,
            title: `${transfer.sourceWallet ? shortenAddress(transfer.sourceWallet, 6, 6) : 'unknown source'} -> ${transfer.destinationWallet ? shortenAddress(transfer.destinationWallet, 6, 6) : 'unknown destination'}`,
            meta: `${formatRawUsdcCompact(transfer.amountRaw)} ${transfer.asset} / ${shortenAddress(transfer.signature, 8, 6)} / ${formatRelativeTime(transfer.eventTime)}`,
          }))}
          empty="No observed transfers yet."
        />
      </section>
    </PageFrame>
  );
}

function ProofsPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const ordersQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentOrders,
    queryFn: () => api.listPaymentOrders(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const runsQuery = useQuery({
    queryKey: queryKeys(workspaceId).paymentRuns,
    queryFn: () => api.listPaymentRuns(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const proofMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: 'order' | 'run'; id: string }) => (
      kind === 'order' ? api.getPaymentOrderProof(workspaceId!, id) : api.getPaymentRunProof(workspaceId!, id)
    ),
    onSuccess: (proof, variables) => downloadJson(`${variables.kind}-proof-${variables.id}.json`, proof),
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not export proof.'),
  });

  if (!workspaceId || !workspace) return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  const proofReadyOrders = (ordersQuery.data?.items ?? []).filter((order) => ['settled', 'closed', 'partially_settled', 'exception'].includes(order.derivedState));
  const runs = runsQuery.data?.items ?? [];
  return (
    <PageFrame eyebrow="Proofs" title="Proof packets" description="Export payment and run-level packets for finance review, audit, and handoff.">
      {message ? <div className="notice">{message}</div> : null}
      <section className="panel">
        <SectionHeader title={`Payment proofs [${proofReadyOrders.length}]`} />
        <ActionPaymentTable
          workspaceId={workspaceId}
          paymentOrders={proofReadyOrders}
          actionHeader="Proof"
          emptyTitle="No proof-ready payments"
          emptyDescription="Settled or exception payments will appear here."
          renderAction={(order) => <button className="button button-secondary button-small" onClick={() => proofMutation.mutate({ kind: 'order', id: order.paymentOrderId })} type="button">Export</button>}
        />
      </section>
      <section className="panel panel-spaced">
        <SectionHeader title={`Run proofs [${runs.length}]`} />
        <PaymentRunProofTable
          workspaceId={workspaceId}
          runs={runs}
          onExport={(run) => proofMutation.mutate({ kind: 'run', id: run.paymentRunId })}
        />
      </section>
    </PageFrame>
  );
}

function AddressBookPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const addressesQuery = useQuery({
    queryKey: queryKeys(workspaceId).addresses,
    queryFn: () => api.listAddresses(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const counterpartiesQuery = useQuery({
    queryKey: queryKeys(workspaceId).counterparties,
    queryFn: () => api.listCounterparties(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const destinationsQuery = useQuery({
    queryKey: queryKeys(workspaceId).destinations,
    queryFn: () => api.listDestinations(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const payeesQuery = useQuery({
    queryKey: queryKeys(workspaceId).payees,
    queryFn: () => api.listPayees(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  async function invalidateRegistry() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).addresses }),
      queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).counterparties }),
      queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).destinations }),
      queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).payees }),
    ]);
  }

  const createAddressMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      return api.createAddress(workspaceId!, {
        displayName: getOptionalFormString(formData, 'displayName') ?? undefined,
        address: getFormString(formData, 'address'),
        notes: getOptionalFormString(formData, 'notes') ?? undefined,
      });
    },
    onSuccess: async () => {
      setMessage('Wallet saved.');
      await invalidateRegistry();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not save wallet.'),
  });
  const createCounterpartyMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      return api.createCounterparty(workspaceId!, {
        displayName: getFormString(formData, 'displayName'),
        category: getOptionalFormString(formData, 'category') ?? undefined,
      });
    },
    onSuccess: async () => {
      setMessage('Counterparty saved.');
      await invalidateRegistry();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not save counterparty.'),
  });
  const createDestinationMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      return api.createDestination(workspaceId!, {
        linkedWorkspaceAddressId: getFormString(formData, 'linkedWorkspaceAddressId'),
        counterpartyId: getOptionalFormString(formData, 'counterpartyId') ?? undefined,
        label: getFormString(formData, 'label'),
        trustState: getFormString(formData, 'trustState') as Destination['trustState'],
        isInternal: formData.get('isInternal') === 'on',
        notes: getOptionalFormString(formData, 'notes') ?? undefined,
      });
    },
    onSuccess: async () => {
      setMessage('Destination saved.');
      await invalidateRegistry();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not save destination.'),
  });
  const createPayeeMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      return api.createPayee(workspaceId!, {
        name: getFormString(formData, 'name'),
        defaultDestinationId: getOptionalFormString(formData, 'defaultDestinationId') ?? null,
        externalReference: getOptionalFormString(formData, 'externalReference') ?? null,
        notes: getOptionalFormString(formData, 'notes') ?? null,
      });
    },
    onSuccess: async () => {
      setMessage('Payee saved.');
      await invalidateRegistry();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not save payee.'),
  });

  if (!workspaceId || !workspace) {
    return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  }

  const addresses = addressesQuery.data?.items ?? [];
  const counterparties = counterpartiesQuery.data?.items ?? [];
  const destinations = destinationsQuery.data?.items ?? [];
  const payees = payeesQuery.data?.items ?? [];

  return (
    <PageFrame
      eyebrow="Support Data"
      title="Address book"
      description="Manage saved wallets, destinations, counterparties, and payees used by payment requests and runs."
    >
      {message ? <div className="notice">{message}</div> : null}
      <section className="panel">
        <SectionHeader title={`Destinations [${destinations.length}]`} description="Operator-facing payout endpoints." />
        <DestinationsTable destinations={destinations} />
      </section>
      <div className="quad-grid">
        <section className="panel">
          <SectionHeader title="Add wallet" />
          <form className="form-stack" onSubmit={(event) => createAddressMutation.mutate(event)}>
            <label className="field">Name<input name="displayName" placeholder="Ops vault" /></label>
            <label className="field">Solana address<input name="address" required placeholder="Wallet address" /></label>
            <label className="field">Notes<input name="notes" placeholder="Optional context" /></label>
            <button className="button button-primary" type="submit">Save wallet</button>
          </form>
        </section>
        <section className="panel">
          <SectionHeader title="Add counterparty" />
          <form className="form-stack" onSubmit={(event) => createCounterpartyMutation.mutate(event)}>
            <label className="field">Name<input name="displayName" required placeholder="Acme Corp" /></label>
            <label className="field">Category<input name="category" placeholder="vendor, contractor, internal" /></label>
            <button className="button button-primary" type="submit">Save counterparty</button>
          </form>
        </section>
        <section className="panel">
          <SectionHeader title="Add destination" />
          <form className="form-stack" onSubmit={(event) => createDestinationMutation.mutate(event)}>
            <label className="field">
              Linked wallet
              <select name="linkedWorkspaceAddressId" required defaultValue="">
                <option value="" disabled>Select wallet</option>
                {addresses.map((address) => <option key={address.workspaceAddressId} value={address.workspaceAddressId}>{walletLabel(address)}</option>)}
              </select>
            </label>
            <label className="field">Destination label<input name="label" required placeholder="Acme payout wallet" /></label>
            <label className="field">
              Counterparty
              <select name="counterpartyId" defaultValue="">
                <option value="">Unassigned</option>
                {counterparties.map((counterparty) => <option key={counterparty.counterpartyId} value={counterparty.counterpartyId}>{counterparty.displayName}</option>)}
              </select>
            </label>
            <label className="field">
              Trust state
              <select name="trustState" defaultValue="unreviewed">
                <option value="unreviewed">Unreviewed</option>
                <option value="trusted">Trusted</option>
                <option value="restricted">Restricted</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="field checkbox-field"><input name="isInternal" type="checkbox" /> Internal destination</label>
            <button className="button button-primary" disabled={!addresses.length} type="submit">Save destination</button>
          </form>
        </section>
        <section className="panel">
          <SectionHeader title="Add payee" />
          <form className="form-stack" onSubmit={(event) => createPayeeMutation.mutate(event)}>
            <label className="field">Payee name<input name="name" required placeholder="Fuyo LLC" /></label>
            <label className="field">
              Default destination
              <select name="defaultDestinationId" defaultValue="">
                <option value="">Optional</option>
                {destinations.map((destination) => <option key={destination.destinationId} value={destination.destinationId}>{destination.label}</option>)}
              </select>
            </label>
            <label className="field">Reference<input name="externalReference" placeholder="Vendor ID" /></label>
            <label className="field">Notes<input name="notes" placeholder="Optional context" /></label>
            <button className="button button-primary" type="submit">Save payee</button>
          </form>
        </section>
      </div>
      <div className="split-panels">
        <section className="panel"><SectionHeader title={`Wallets [${addresses.length}]`} /><WalletsTable addresses={addresses} destinations={destinations} /></section>
        <section className="panel"><SectionHeader title={`Payees [${payees.length}]`} /><PayeesTable payees={payees} /></section>
      </div>
      <section className="panel">
        <SectionHeader title={`Counterparties [${counterparties.length}]`} />
        <CounterpartiesTable counterparties={counterparties} destinations={destinations} />
      </section>
    </PageFrame>
  );
}

function PolicyPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const policyQuery = useQuery({
    queryKey: queryKeys(workspaceId).approvalPolicy,
    queryFn: () => api.getApprovalPolicy(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const updateMutation = useMutation({
    mutationFn: async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      return api.updateApprovalPolicy(workspaceId!, {
        policyName: getOptionalFormString(formData, 'policyName') ?? undefined,
        isActive: formData.get('isActive') === 'on',
        ruleJson: {
          requireTrustedDestination: formData.get('requireTrustedDestination') === 'on',
          requireApprovalForExternal: formData.get('requireApprovalForExternal') === 'on',
          requireApprovalForInternal: formData.get('requireApprovalForInternal') === 'on',
          externalApprovalThresholdRaw: usdcToRaw(getFormString(formData, 'externalThreshold')),
          internalApprovalThresholdRaw: usdcToRaw(getFormString(formData, 'internalThreshold')),
        },
      });
    },
    onSuccess: async () => {
      setMessage('Approval policy updated.');
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).approvalPolicy });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not update policy.'),
  });

  if (!workspaceId || !workspace) return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  const policy = policyQuery.data;
  if (!policy) return <ScreenState title="Loading policy" description="Fetching approval rules." />;

  return (
    <PageFrame eyebrow="Policy" title="Approval policy" description="Define when payments can go live and when they need review.">
      {message ? <div className="notice">{message}</div> : null}
      <div className="split-panels">
        <section className="panel">
          <SectionHeader title="Current strategy" description="Human-readable policy summary." />
          <InfoGrid items={[
            ['Policy', policy.policyName],
            ['Status', policy.isActive ? 'active' : 'inactive'],
            ['Trusted destination required', yesNo(policy.ruleJson.requireTrustedDestination)],
            ['External requires approval', yesNo(policy.ruleJson.requireApprovalForExternal)],
            ['External threshold', `${formatRawUsdcCompact(policy.ruleJson.externalApprovalThresholdRaw)} USDC`],
            ['Internal threshold', `${formatRawUsdcCompact(policy.ruleJson.internalApprovalThresholdRaw)} USDC`],
          ]} />
        </section>
        <section className="panel">
          <SectionHeader title="Edit policy" description="Use decimal USDC thresholds." />
          <form className="form-stack" onSubmit={(event) => updateMutation.mutate(event)}>
            <label className="field">Policy name<input name="policyName" defaultValue={policy.policyName} /></label>
            <label className="field checkbox-field"><input name="isActive" defaultChecked={policy.isActive} type="checkbox" /> Active</label>
            <label className="field checkbox-field"><input name="requireTrustedDestination" defaultChecked={policy.ruleJson.requireTrustedDestination} type="checkbox" /> Require trusted destination</label>
            <label className="field checkbox-field"><input name="requireApprovalForExternal" defaultChecked={policy.ruleJson.requireApprovalForExternal} type="checkbox" /> Require approval for external payments</label>
            <label className="field checkbox-field"><input name="requireApprovalForInternal" defaultChecked={policy.ruleJson.requireApprovalForInternal} type="checkbox" /> Require approval for internal payments</label>
            <label className="field">External approval threshold<input name="externalThreshold" defaultValue={formatRawUsdcCompact(policy.ruleJson.externalApprovalThresholdRaw)} /></label>
            <label className="field">Internal approval threshold<input name="internalThreshold" defaultValue={formatRawUsdcCompact(policy.ruleJson.internalApprovalThresholdRaw)} /></label>
            <button className="button button-primary" type="submit">Update policy</button>
          </form>
        </section>
      </div>
    </PageFrame>
  );
}

function ExceptionsPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const workspace = findWorkspace(session, workspaceId);
  const exceptionsQuery = useQuery({
    queryKey: queryKeys(workspaceId).exceptions,
    queryFn: () => api.listExceptions(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 5_000,
  });
  const actionMutation = useMutation({
    mutationFn: ({ exceptionId, action }: { exceptionId: string; action: 'reviewed' | 'expected' | 'dismissed' | 'reopen' }) => (
      api.applyExceptionAction(workspaceId!, exceptionId, { action })
    ),
    onSuccess: async () => {
      setMessage('Exception updated.');
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId).exceptions });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not update exception.'),
  });

  if (!workspaceId || !workspace) return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  const exceptions = exceptionsQuery.data?.items ?? [];

  return (
    <PageFrame eyebrow="Exceptions" title={`Exceptions [${exceptions.length}]`} description="Resolve operational problems created by settlement mismatch, partials, or unknown activity.">
      {message ? <div className="notice">{message}</div> : null}
      <ExceptionsTable workspaceId={workspaceId} exceptions={exceptions} onAction={(exceptionId, action) => actionMutation.mutate({ exceptionId, action })} />
    </PageFrame>
  );
}

function OpsPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = findWorkspace(session, workspaceId);
  const opsQuery = useQuery({
    queryKey: queryKeys(workspaceId).opsHealth,
    queryFn: () => api.getOpsHealth(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 10_000,
  });
  const reconciliationQuery = useQuery({
    queryKey: ['reconciliation', workspaceId],
    queryFn: () => api.listReconciliation(workspaceId!),
    enabled: Boolean(workspaceId),
    refetchInterval: 10_000,
  });

  if (!workspaceId || !workspace) return <ScreenState title="Workspace unavailable" description="Choose a workspace from the sidebar." />;
  const health = opsQuery.data;

  return (
    <PageFrame eyebrow="Ops Health" title="Infrastructure health" description="Keep worker and reconciliation health visible without turning it into the main payment flow.">
      {health ? <OpsHealthPanel health={health} /> : <EmptyState title="Loading health" description="Fetching worker and reconciliation metrics." />}
      <section className="panel panel-spaced">
        <SectionHeader title="Recent reconciliation rows" />
        <SimpleList
          items={(reconciliationQuery.data?.items ?? []).slice(0, 12).map((row) => ({
            id: row.transferRequestId,
            title: `${walletLabel(row.sourceWorkspaceAddress) ?? 'Source not set'} -> ${row.destination?.label ?? walletLabel(row.destinationWorkspaceAddress) ?? 'destination'}`,
            meta: `${formatRawUsdcCompact(row.amountRaw)} ${row.asset} / ${labelState(row.requestDisplayState)}`,
          }))}
          empty="No reconciliation rows yet."
        />
      </section>
    </PageFrame>
  );
}

function PaymentDetailPage({ session }: { session: AuthenticatedSession }) {
  const { workspaceId, paymentOrderId } = useParams<{ workspaceId: string; paymentOrderId: string }>();
  const queryClient = useQueryClient();
  const [preparedPacket, setPreparedPacket] = useState<PaymentExecutionPacket | null>(null);
  const [manualSignature, setManualSignature] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>();
  const [wallets, setWallets] = useState<BrowserWalletOption[]>(() => discoverSolanaWallets());
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => subscribeSolanaWallets(setWallets), []);

  const workspace = findWorkspace(session, workspaceId);
  const paymentOrderQuery = useQuery({
    queryKey: queryKeys(workspaceId, paymentOrderId).paymentOrder,
    queryFn: () => api.getPaymentOrderDetail(workspaceId!, paymentOrderId!),
    enabled: Boolean(workspaceId && paymentOrderId),
    refetchInterval: 4_000,
  });

  const prepareMutation = useMutation({
    mutationFn: () => api.preparePaymentOrderExecution(workspaceId!, paymentOrderId!),
    onSuccess: async (result) => {
      setPreparedPacket(result.executionPacket);
      setActionMessage('Payment packet prepared.');
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId, paymentOrderId).paymentOrder });
    },
    onError: (error) => setActionMessage(error instanceof Error ? error.message : 'Failed to prepare payment.'),
  });

  const attachSignatureMutation = useMutation({
    mutationFn: (submittedSignature: string) => api.attachPaymentOrderSignature(workspaceId!, paymentOrderId!, {
      submittedSignature,
      submittedAt: new Date().toISOString(),
    }),
    onSuccess: async () => {
      setActionMessage('Execution signature attached.');
      setManualSignature('');
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId, paymentOrderId).paymentOrder });
    },
    onError: (error) => setActionMessage(error instanceof Error ? error.message : 'Failed to attach signature.'),
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const packet = preparedPacket ?? getPreparedPacket(paymentOrderQuery.data);
      if (!packet) {
        throw new Error('Prepare the payment packet before signing.');
      }
      const signature = await signAndSubmitPreparedPayment(packet, selectedWalletId);
      await api.attachPaymentOrderSignature(workspaceId!, paymentOrderId!, {
        submittedSignature: signature,
        submittedAt: new Date().toISOString(),
      });
      return signature;
    },
    onSuccess: async (signature) => {
      setActionMessage(`Submitted ${shortenAddress(signature, 8, 8)}.`);
      await queryClient.invalidateQueries({ queryKey: queryKeys(workspaceId, paymentOrderId).paymentOrder });
    },
    onError: (error) => setActionMessage(error instanceof Error ? error.message : 'Failed to sign and submit payment.'),
  });

  const proofMutation = useMutation({
    mutationFn: () => api.getPaymentOrderProof(workspaceId!, paymentOrderId!),
    onSuccess: (proof) => {
      downloadJson(`payment-proof-${paymentOrderId}.json`, proof);
    },
    onError: (error) => setActionMessage(error instanceof Error ? error.message : 'Failed to export proof.'),
  });

  if (!workspaceId || !paymentOrderId || !workspace) {
    return <ScreenState title="Payment unavailable" description="Choose a payment from the queue." />;
  }

  if (paymentOrderQuery.isLoading) {
    return <ScreenState title="Loading payment" description="Fetching the payment record." />;
  }

  const order = paymentOrderQuery.data;
  if (!order) {
    return <ScreenState title="Payment not found" description="The payment may have been deleted or moved." />;
  }

  const summary = summarizePayment(order);
  const packet = preparedPacket ?? getPreparedPacket(order);
  const latestExecution = order.reconciliationDetail?.latestExecution ?? null;
  const match = order.reconciliationDetail?.match ?? null;
  const timeline = [
    ...order.events.map((event) => ({
      type: event.eventType,
      createdAt: event.createdAt,
      description: event.afterState ? `${event.beforeState ?? 'created'} -> ${event.afterState}` : 'payment event',
    })),
    ...(order.reconciliationDetail?.timeline ?? []).map(timelineLabel),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return (
    <PageFrame
      eyebrow="Payment"
      title={summary.title}
      description={summary.description}
      action={
        <div className="action-cluster">
          <button className="button button-secondary" onClick={() => proofMutation.mutate()} type="button">
            Export proof
          </button>
          <button className="button button-secondary" onClick={() => void api.downloadPaymentOrderAuditExport(workspaceId, paymentOrderId)} type="button">
            Audit CSV
          </button>
        </div>
      }
    >
      <PaymentHero order={order} />
      <WorkflowRail steps={buildWorkflow(order)} />
      {actionMessage ? <div className="notice">{actionMessage}</div> : null}
      <div className="detail-grid">
        <div className="detail-main">
          <InfoSection title="Request" state={labelState(order.derivedState)}>
            <InfoGrid
              items={[
                ['Payee', order.payee?.name ?? order.counterparty?.displayName ?? 'Unassigned'],
                ['Reference', order.externalReference ?? order.invoiceNumber ?? 'None'],
                ['Memo', order.memo ?? 'None'],
                ['Due date', order.dueAt ? formatTimestamp(order.dueAt) : 'Not set'],
                ['Requested by', order.createdByUser?.email ?? 'System'],
              ]}
            />
          </InfoSection>
          <InfoSection title="Approval" state={getApprovalLabel(order)}>
            <p className="section-copy">{getApprovalSummary(order)}</p>
            {order.reconciliationDetail?.approvalDecisions.length ? (
              <TimelineList
                items={order.reconciliationDetail.approvalDecisions.map((decision) => ({
                  title: decision.action.replaceAll('_', ' '),
                  body: decision.comment ?? decision.payloadJson?.message?.toString() ?? 'Policy decision recorded.',
                  time: decision.createdAt,
                }))}
              />
            ) : null}
          </InfoSection>
          <InfoSection title="Execution" state={getExecutionLabel(order)}>
            <ExecutionPanel
              latestSignature={latestExecution?.submittedSignature ?? null}
              packet={packet}
              wallets={wallets}
              selectedWalletId={selectedWalletId}
              isPreparing={prepareMutation.isPending}
              isSigning={signMutation.isPending}
              manualSignature={manualSignature}
              onManualSignatureChange={setManualSignature}
              onPrepare={() => prepareMutation.mutate()}
              onSign={() => signMutation.mutate()}
              onSelectWallet={setSelectedWalletId}
              onAttachSignature={() => {
                if (!manualSignature.trim()) {
                  setActionMessage('Paste a submitted signature first.');
                  return;
                }
                attachSignatureMutation.mutate(manualSignature.trim());
              }}
            />
          </InfoSection>
          <InfoSection title="Settlement" state={getSettlementLabel(order)}>
            <InfoGrid
              items={[
                ['Match status', match?.matchStatus?.replaceAll('_', ' ') ?? 'Not matched yet'],
                ['Matched amount', match ? `${formatRawUsdcCompact(match.matchedAmountRaw)} ${order.asset}` : 'None'],
                ['Observed signature', match?.signature ?? latestExecution?.submittedSignature ?? 'None'],
                ['Chain to match', match?.chainToMatchMs === null || match?.chainToMatchMs === undefined ? 'Not available' : `${match.chainToMatchMs} ms`],
              ]}
            />
            {match?.explanation ? <p className="section-copy">{match.explanation}</p> : null}
          </InfoSection>
          {order.reconciliationDetail?.exceptions.length ? (
            <InfoSection title="Exceptions" state={String(order.reconciliationDetail.exceptions.length)}>
              <TimelineList
                items={order.reconciliationDetail.exceptions.map((exception) => ({
                  title: `${exception.severity} / ${exception.status}`,
                  body: exception.explanation,
                  time: exception.createdAt,
                }))}
              />
            </InfoSection>
          ) : null}
          <InfoSection title="Timeline" state={String(timeline.length)}>
            <TimelineList items={timeline.map((item) => ({ title: item.type, body: item.description, time: item.createdAt }))} />
          </InfoSection>
          <InfoSection title="Notes" state={String(order.reconciliationDetail?.notes.length ?? 0)}>
            {order.reconciliationDetail?.notes.length ? (
              <TimelineList
                items={order.reconciliationDetail.notes.map((note) => ({
                  title: note.authorUser?.email ?? 'Operator note',
                  body: note.body,
                  time: note.createdAt,
                }))}
              />
            ) : (
              <p className="section-copy">No notes yet.</p>
            )}
          </InfoSection>
        </div>
        <aside className="detail-side">
          <SidePanel title="Payment proof">
            <p>Export the packet that connects intent, approval, execution, settlement, reconciliation, and exceptions.</p>
            <button className="button button-primary button-full" onClick={() => proofMutation.mutate()} type="button">
              Export proof JSON
            </button>
          </SidePanel>
          <SidePanel title="Balance">
            <StatusBadge state={order.balanceWarning.status}>{order.balanceWarning.status}</StatusBadge>
            <p>{order.balanceWarning.message}</p>
          </SidePanel>
          <SidePanel title="Links">
            {latestExecution?.submittedSignature ? (
              <a className="link-button" href={orbTransactionUrl(latestExecution.submittedSignature)} rel="noreferrer" target="_blank">
                Open submitted transaction
              </a>
            ) : null}
            <a className="link-button" href={solanaAccountUrl(order.destination.walletAddress)} rel="noreferrer" target="_blank">
              Open destination wallet
            </a>
          </SidePanel>
        </aside>
      </div>
    </PageFrame>
  );
}

function PaymentTable({
  workspaceId,
  paymentOrders,
}: {
  workspaceId: string;
  paymentOrders: PaymentOrder[];
}) {
  if (!paymentOrders.length) {
    return <EmptyState title="No payments here" description="There are no payments for this view yet." />;
  }

  return (
    <div className="data-table">
      <div className="data-table-row data-table-head">
        <span>Payee</span>
        <span>Amount</span>
        <span>Source</span>
        <span>Destination</span>
        <span>Reference</span>
        <span>Status</span>
      </div>
      {paymentOrders.map((order) => (
        <Link className="data-table-row data-table-link" key={order.paymentOrderId} to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}`}>
          <span>
            <strong>{order.payee?.name ?? order.destination.label}</strong>
            <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
          </span>
          <span>{formatRawUsdcCompact(order.amountRaw)} {order.asset}</span>
          <span>{order.sourceWorkspaceAddress?.displayName ?? shortenAddress(order.sourceWorkspaceAddress?.address)}</span>
          <span>{order.destination.label}</span>
          <span>{order.externalReference ?? order.invoiceNumber ?? order.memo ?? 'None'}</span>
          <span><StatusBadge state={order.derivedState}>{labelState(order.derivedState)}</StatusBadge></span>
        </Link>
      ))}
    </div>
  );
}

function ActionPaymentTable({
  workspaceId,
  paymentOrders,
  actionHeader,
  emptyTitle,
  emptyDescription,
  renderAction,
}: {
  workspaceId: string;
  paymentOrders: PaymentOrder[];
  actionHeader: string;
  emptyTitle: string;
  emptyDescription: string;
  renderAction: (order: PaymentOrder) => ReactNode;
}) {
  if (!paymentOrders.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-actions">
        <span>Payee</span><span>Amount</span><span>Destination</span><span>Reference</span><span>Status</span><span>{actionHeader}</span>
      </div>
      {paymentOrders.map((order) => (
        <div className="data-table-row data-table-row-actions" key={order.paymentOrderId}>
          <Link to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}`}>
            <strong>{order.payee?.name ?? order.destination.label}</strong>
            <small>{shortenAddress(order.paymentOrderId, 8, 6)}</small>
          </Link>
          <span>{formatRawUsdcCompact(order.amountRaw)} {order.asset}</span>
          <span>{order.destination.label}</span>
          <span>{order.externalReference ?? order.invoiceNumber ?? order.memo ?? 'None'}</span>
          <span><StatusBadge state={order.derivedState}>{labelState(order.derivedState)}</StatusBadge></span>
          <span>{renderAction(order)}</span>
        </div>
      ))}
    </div>
  );
}

function PaymentRequestsTable({
  workspaceId,
  requests,
  ordersByRequest,
}: {
  workspaceId: string;
  requests: PaymentRequest[];
  ordersByRequest: Map<string | null, PaymentOrder>;
}) {
  if (!requests.length) {
    return <EmptyState title="No payment requests yet" description="Create a manual request or import a CSV batch." />;
  }
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-requests">
        <span>Payee</span><span>Destination</span><span>Amount</span><span>Reference</span><span>State</span><span>Created</span>
      </div>
      {requests.map((request) => {
        const order = ordersByRequest.get(request.paymentRequestId);
        const content = (
          <>
            <span><strong>{request.payee?.name ?? request.reason}</strong><small>{shortenAddress(request.paymentRequestId, 8, 6)}</small></span>
            <span>{request.destination.label}</span>
            <span>{formatRawUsdcCompact(request.amountRaw)} {request.asset}</span>
            <span>{request.externalReference ?? 'None'}</span>
            <span><StatusBadge state={order?.derivedState ?? request.state}>{labelState(order?.derivedState ?? request.state)}</StatusBadge></span>
            <span>{formatTimestamp(request.createdAt)}</span>
          </>
        );
        if (order) {
          return (
            <Link className="data-table-row data-table-link data-table-row-requests" key={request.paymentRequestId} to={`/workspaces/${workspaceId}/payments/${order.paymentOrderId}`}>
              {content}
            </Link>
          );
        }
        return <div className="data-table-row data-table-row-requests" key={request.paymentRequestId}>{content}</div>;
      })}
    </div>
  );
}

function PaymentRunsTable({ workspaceId, runs }: { workspaceId: string; runs: PaymentRun[] }) {
  if (!runs.length) {
    return <EmptyState title="No payment runs yet" description="Import a CSV batch to create a run." />;
  }
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-runs">
        <span>Run</span><span>Items</span><span>Total</span><span>Ready</span><span>State</span><span>Created</span>
      </div>
      {runs.map((run) => (
        <Link className="data-table-row data-table-link data-table-row-runs" key={run.paymentRunId} to={`/workspaces/${workspaceId}/runs/${run.paymentRunId}`}>
          <span><strong>{run.runName}</strong><small>{shortenAddress(run.paymentRunId, 8, 6)}</small></span>
          <span>{run.totals.orderCount}</span>
          <span>{formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC</span>
          <span>{run.totals.readyCount}/{run.totals.orderCount}</span>
          <span><StatusBadge state={run.derivedState}>{labelState(run.derivedState)}</StatusBadge></span>
          <span>{formatTimestamp(run.createdAt)}</span>
        </Link>
      ))}
    </div>
  );
}

function PaymentRunProofTable({
  workspaceId,
  runs,
  onExport,
}: {
  workspaceId: string;
  runs: PaymentRun[];
  onExport: (run: PaymentRun) => void;
}) {
  if (!runs.length) return <EmptyState title="No payment runs yet" description="Import a CSV batch to create run-level proof." />;
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-runs">
        <span>Run</span><span>Items</span><span>Total</span><span>Ready</span><span>State</span><span>Proof</span>
      </div>
      {runs.map((run) => (
        <div className="data-table-row data-table-row-runs" key={run.paymentRunId}>
          <Link to={`/workspaces/${workspaceId}/runs/${run.paymentRunId}`}><strong>{run.runName}</strong><small>{shortenAddress(run.paymentRunId, 8, 6)}</small></Link>
          <span>{run.totals.orderCount}</span>
          <span>{formatRawUsdcCompact(run.totals.totalAmountRaw)} USDC</span>
          <span>{run.totals.readyCount}/{run.totals.orderCount}</span>
          <span><StatusBadge state={run.derivedState}>{labelState(run.derivedState)}</StatusBadge></span>
          <span><button className="button button-secondary button-small" onClick={() => onExport(run)} type="button">Export</button></span>
        </div>
      ))}
    </div>
  );
}

function DestinationsTable({ destinations }: { destinations: Destination[] }) {
  if (!destinations.length) return <EmptyState title="No destinations yet" description="Create wallets first, then turn them into destinations." />;
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-destinations">
        <span>Destination</span><span>Wallet</span><span>Owner</span><span>Trust</span><span>Scope</span><span>Status</span>
      </div>
      {destinations.map((destination) => (
        <div className="data-table-row data-table-row-destinations" key={destination.destinationId}>
          <span><strong>{destination.label}</strong><small>{destination.destinationType}</small></span>
          <span><AddressLink value={destination.walletAddress} /></span>
          <span>{destination.counterparty?.displayName ?? 'Unassigned'}</span>
          <span><StatusBadge state={destination.trustState}>{destination.trustState}</StatusBadge></span>
          <span>{destination.isInternal ? 'internal' : 'external'}</span>
          <span>{destination.isActive ? 'active' : 'inactive'}</span>
        </div>
      ))}
    </div>
  );
}

function WalletsTable({ addresses, destinations }: { addresses: WorkspaceAddress[]; destinations: Destination[] }) {
  if (!addresses.length) return <EmptyState title="No wallets saved" description="Save a wallet to watch, source, or destination-match USDC payments." />;
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-wallets"><span>Name</span><span>Address</span><span>Destination</span><span>Status</span></div>
      {addresses.map((address) => {
        const destination = destinations.find((item) => item.linkedWorkspaceAddressId === address.workspaceAddressId);
        return (
          <div className="data-table-row data-table-row-wallets" key={address.workspaceAddressId}>
            <span><strong>{walletLabel(address)}</strong><small>{address.assetScope}</small></span>
            <span><AddressLink value={address.address} /></span>
            <span>{destination?.label ?? 'Unlinked'}</span>
            <span>{address.isActive ? 'active' : 'inactive'}</span>
          </div>
        );
      })}
    </div>
  );
}

function PayeesTable({ payees }: { payees: Payee[] }) {
  if (!payees.length) return <EmptyState title="No payees yet" description="Payees are lightweight names mapped to default destinations." />;
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-payees"><span>Name</span><span>Default destination</span><span>Reference</span><span>Status</span></div>
      {payees.map((payee) => (
        <div className="data-table-row data-table-row-payees" key={payee.payeeId}>
          <span><strong>{payee.name}</strong><small>{shortenAddress(payee.payeeId, 8, 6)}</small></span>
          <span>{payee.defaultDestination?.label ?? 'None'}</span>
          <span>{payee.externalReference ?? 'None'}</span>
          <span>{payee.status}</span>
        </div>
      ))}
    </div>
  );
}

function CounterpartiesTable({ counterparties, destinations }: { counterparties: Counterparty[]; destinations: Destination[] }) {
  if (!counterparties.length) return <EmptyState title="No counterparties yet" description="Counterparties are optional business owners behind destinations." />;
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-payees"><span>Name</span><span>Destinations</span><span>Category</span><span>Status</span></div>
      {counterparties.map((counterparty) => (
        <div className="data-table-row data-table-row-payees" key={counterparty.counterpartyId}>
          <span><strong>{counterparty.displayName}</strong></span>
          <span>{destinations.filter((destination) => destination.counterpartyId === counterparty.counterpartyId).length}</span>
          <span>{counterparty.category}</span>
          <span>{counterparty.status}</span>
        </div>
      ))}
    </div>
  );
}

function ExceptionsTable({
  exceptions,
  onAction,
}: {
  workspaceId: string;
  exceptions: ExceptionItem[];
  onAction: (exceptionId: string, action: 'reviewed' | 'expected' | 'dismissed' | 'reopen') => void;
}) {
  if (!exceptions.length) return <EmptyState title="No exceptions" description="Partial settlements, unmatched events, and review-needed payments will appear here." />;
  return (
    <div className="data-table">
      <div className="data-table-row data-table-head data-table-row-exceptions">
        <span>Severity</span><span>Type</span><span>Signature</span><span>Status</span><span>Age</span><span>Actions</span>
      </div>
      {exceptions.map((exception) => (
        <div className="data-table-row data-table-row-exceptions" key={exception.exceptionId}>
          <span><StatusBadge state={exception.severity}>{exception.severity}</StatusBadge></span>
          <span><strong>{labelState(exception.reasonCode)}</strong><small>{exception.explanation}</small></span>
          <span>{exception.signature ? <AddressLink value={exception.signature} kind="transaction" /> : 'None'}</span>
          <span>{exception.status}</span>
          <span>{formatRelativeTime(exception.createdAt)}</span>
          <span className="table-actions">
            <button className="button button-secondary button-small" onClick={() => onAction(exception.exceptionId, 'reviewed')} type="button">Reviewed</button>
            <button className="button button-secondary button-small" onClick={() => onAction(exception.exceptionId, 'dismissed')} type="button">Dismiss</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function OpsHealthPanel({ health }: { health: OpsHealth }) {
  return (
    <section className="panel">
      <SectionHeader title="Worker and reconciliation health" />
      <InfoGrid items={[
        ['Postgres', health.postgres],
        ['Worker', health.workerStatus],
        ['Latest slot', health.latestSlot?.toLocaleString() ?? 'None'],
        ['Latest event', health.latestEventTime ? formatTimestamp(health.latestEventTime) : 'None'],
        ['Worker freshness', health.workerFreshnessMs === null ? 'Unknown' : `${health.workerFreshnessMs} ms`],
        ['Open exceptions', String(health.openExceptionCount)],
        ['Observed transactions', String(health.observedTransactionCount)],
        ['Matches', String(health.matchCount)],
        ['Chain to match p95', health.latencies.chainToMatchMs.p95 === null ? 'Unknown' : `${health.latencies.chainToMatchMs.p95} ms`],
      ]} />
    </section>
  );
}

function PaymentHero({ order }: { order: PaymentOrder }) {
  const latestSignature = order.reconciliationDetail?.latestExecution?.submittedSignature
    ?? order.reconciliationDetail?.match?.signature
    ?? null;

  return (
    <section className="payment-hero">
      <div className="payment-hero-amount">
        <span>Amount</span>
        <strong>{formatRawUsdcCompact(order.amountRaw)} {order.asset}</strong>
      </div>
      <div className="payment-hero-grid">
        <HeroCell label="Signature">
          {latestSignature ? <AddressLink value={latestSignature} kind="transaction" /> : <span>Not submitted</span>}
        </HeroCell>
        <HeroCell label="From">
          {order.sourceWorkspaceAddress?.address ? <AddressLink value={order.sourceWorkspaceAddress.address} /> : <span>Source not set</span>}
        </HeroCell>
        <HeroCell label="To">
          <AddressLink value={order.destination.walletAddress} />
        </HeroCell>
        <HeroCell label="Time">
          <time title={formatTimestamp(order.updatedAt)}>{formatRelativeTime(order.updatedAt)}</time>
        </HeroCell>
      </div>
    </section>
  );
}

function ExecutionPanel({
  latestSignature,
  packet,
  wallets,
  selectedWalletId,
  isPreparing,
  isSigning,
  manualSignature,
  onManualSignatureChange,
  onPrepare,
  onSign,
  onSelectWallet,
  onAttachSignature,
}: {
  latestSignature: string | null;
  packet: PaymentExecutionPacket | null;
  wallets: BrowserWalletOption[];
  selectedWalletId: string | undefined;
  isPreparing: boolean;
  isSigning: boolean;
  manualSignature: string;
  onManualSignatureChange: (value: string) => void;
  onPrepare: () => void;
  onSign: () => void;
  onSelectWallet: (value: string | undefined) => void;
  onAttachSignature: () => void;
}) {
  return (
    <div className="execution-stack">
      {latestSignature ? (
        <div className="notice notice-success">
          Submitted signature <AddressLink value={latestSignature} kind="transaction" />
        </div>
      ) : null}
      {packet ? (
        <div className="packet-box">
          <InfoGrid
            items={[
              ['From', `${shortenAddress(packet.source.walletAddress)} // ${shortenAddress(packet.source.tokenAccountAddress)}`],
              ['To', packet.destination ? `${packet.destination.label} // ${shortenAddress(packet.destination.walletAddress)}` : `${packet.transfers?.length ?? 0} transfers`],
              ['Amount', `${formatRawUsdcCompact(packet.amountRaw)} ${packet.token.symbol}`],
              ['Instructions', `${packet.instructions.length} Solana instruction(s)`],
              ['Required signer', shortenAddress(packet.signerWallet)],
            ]}
          />
        </div>
      ) : (
        <p className="section-copy">Prepare the exact non-custodial transaction packet before signing.</p>
      )}
      <div className="action-cluster">
        <button className="button button-secondary" disabled={isPreparing} onClick={onPrepare} type="button">
          {isPreparing ? 'Preparing...' : 'Prepare payment packet'}
        </button>
      </div>
      <label className="field">
        Browser wallet
        <select value={selectedWalletId ?? ''} onChange={(event) => onSelectWallet(event.target.value || undefined)}>
          <option value="">Auto-detect wallet</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name}{wallet.address ? ` // ${shortenAddress(wallet.address)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <button className="button button-primary" disabled={!packet || isSigning} onClick={onSign} type="button">
        {isSigning ? 'Signing...' : 'Sign and submit with source wallet'}
      </button>
      <div className="manual-signature">
        <label className="field">
          Manual submitted signature
          <input value={manualSignature} onChange={(event) => onManualSignatureChange(event.target.value)} placeholder="Paste transaction signature" />
        </label>
        <button className="button button-secondary" onClick={onAttachSignature} type="button">
          Attach evidence
        </button>
      </div>
    </div>
  );
}

function PageFrame({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action ? <div className="page-actions">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

function WorkflowRail({
  steps,
}: {
  steps: Array<{ label: string; subtext: string; state: 'pending' | 'current' | 'complete' | 'blocked' }>;
}) {
  return (
    <section className="workflow-rail" aria-label="Payment workflow">
      {steps.map((step) => (
        <div className={`workflow-step workflow-step-${step.state}`} key={step.label}>
          <span>{step.label}</span>
          <strong>{step.subtext}</strong>
        </div>
      ))}
    </section>
  );
}

function InfoSection({
  title,
  state,
  children,
}: {
  title: string;
  state?: string;
  children: ReactNode;
}) {
  return (
    <section className="info-section">
      <header>
        <h2>{title}</h2>
        {state ? <StatusBadge state={state}>{state}</StatusBadge> : null}
      </header>
      <div className="info-section-body">{children}</div>
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="info-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TimelineList({ items }: { items: Array<{ title: string; body: React.ReactNode; time: string }> }) {
  if (!items.length) {
    return <p className="section-copy">No events yet.</p>;
  }

  return (
    <div className="timeline-list">
      {items.map((item, index) => (
        <article key={`${item.title}-${item.time}-${index}`}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
          <time title={formatTimestamp(item.time)}>{formatRelativeTime(item.time)}</time>
        </article>
      ))}
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="side-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="section-header">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function SimpleList({
  items,
  empty,
}: {
  items: Array<{ id: string; title: string; meta: string }>;
  empty: string;
}) {
  if (!items.length) {
    return <EmptyState title={empty} description="Use the available actions on this page to create the first record." />;
  }
  return (
    <div className="simple-list">
      {items.map((item) => (
        <article key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
        </article>
      ))}
    </div>
  );
}

function ScreenState({ title, description }: { title: string; description: string }) {
  return (
    <main className="screen-state">
      <EmptyState title={title} description={description} />
    </main>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p>{title}</p>
      {children}
    </section>
  );
}

function HeroCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hero-cell">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function AddressLink({ value, kind = 'account' }: { value: string; kind?: 'account' | 'transaction' }) {
  const href = kind === 'transaction' ? orbTransactionUrl(value) : solanaAccountUrl(value);
  return (
    <span className="address-link">
      <button onClick={() => void navigator.clipboard?.writeText(value)} title={value} type="button">
        {shortenAddress(value, 6, 6)}
      </button>
      <a href={href} rel="noreferrer" target="_blank" aria-label="Open in explorer">↗</a>
    </span>
  );
}

function StatusBadge({ state, children }: { state: string; children: ReactNode }) {
  return <span className={`status-badge status-${toneForState(state)}`}>{children}</span>;
}

function getWorkspaces(session: AuthenticatedSession) {
  return session.organizations.flatMap((organization) => (
    organization.workspaces.map((workspace) => ({ organization, workspace }))
  ));
}

function findWorkspace(session: AuthenticatedSession, workspaceId?: string): Workspace | null {
  if (!workspaceId) return null;
  for (const organization of session.organizations) {
    const workspace = organization.workspaces.find((candidate) => candidate.workspaceId === workspaceId);
    if (workspace) return workspace;
  }
  return null;
}

function isActionableOrder(order: PaymentOrder) {
  return ['pending_approval', 'approved', 'ready_for_execution', 'exception', 'partially_settled'].includes(order.derivedState);
}

function summarizePayment(order: PaymentOrder) {
  const title = order.payee?.name ?? order.counterparty?.displayName ?? order.destination.label;
  const reference = order.externalReference ?? order.invoiceNumber ?? order.memo ?? 'No reference';
  return {
    title,
    description: `${formatRawUsdcCompact(order.amountRaw)} ${order.asset} / ${reference}`,
  };
}

function buildWorkflow(order: PaymentOrder) {
  const states: PaymentOrderState[] = ['draft', 'pending_approval', 'ready_for_execution', 'execution_recorded', 'settled'];
  const currentIndex = Math.max(states.indexOf(order.derivedState), 0);
  const blocked = order.derivedState === 'exception' || order.derivedState === 'partially_settled' || order.derivedState === 'cancelled';
  return [
    { label: 'Request', subtext: 'Intent captured', state: 'complete' as const },
    { label: 'Approval', subtext: getApprovalLabel(order), state: stepState(1, currentIndex, blocked) },
    { label: 'Execution', subtext: getExecutionLabel(order), state: stepState(2, currentIndex, blocked) },
    { label: 'Settlement', subtext: getSettlementLabel(order), state: blocked ? 'blocked' as const : stepState(4, currentIndex, false) },
    { label: 'Proof', subtext: order.derivedState === 'settled' || order.derivedState === 'closed' ? 'Ready' : 'Pending', state: order.derivedState === 'settled' || order.derivedState === 'closed' ? 'complete' as const : 'pending' as const },
  ];
}

function buildRunWorkflow(run: PaymentRun) {
  const state = run.derivedState;
  const blocked = state === 'exception' || state === 'partially_settled' || state === 'cancelled';
  const settled = state === 'settled' || state === 'closed';
  const ready = run.totals.readyCount > 0;
  return [
    { label: 'Imported', subtext: `${run.totals.orderCount} rows`, state: 'complete' as const },
    { label: 'Reviewed', subtext: run.totals.pendingApprovalCount ? `${run.totals.pendingApprovalCount} need approval` : 'Reviewed', state: run.totals.pendingApprovalCount ? 'current' as const : 'complete' as const },
    { label: 'Approved', subtext: ready || settled ? 'Ready rows exist' : 'Waiting', state: ready || settled ? 'complete' as const : 'pending' as const },
    { label: 'Prepared', subtext: ready ? 'Ready to prepare' : 'Pending', state: ready ? 'current' as const : 'pending' as const },
    { label: 'Submitted', subtext: blocked ? 'Needs review' : settled ? 'Submitted' : 'Pending', state: blocked ? 'blocked' as const : settled ? 'complete' as const : 'pending' as const },
    { label: 'Proven', subtext: settled ? 'Proof ready' : 'Pending', state: settled ? 'complete' as const : 'pending' as const },
  ];
}

function stepState(stepIndex: number, currentIndex: number, blocked: boolean) {
  if (blocked && stepIndex >= currentIndex) return 'blocked' as const;
  if (stepIndex < currentIndex) return 'complete' as const;
  if (stepIndex === currentIndex) return 'current' as const;
  return 'pending' as const;
}

function getApprovalLabel(order: PaymentOrder) {
  if (order.derivedState === 'pending_approval') return 'Needs approval';
  if (order.derivedState === 'draft') return 'Draft';
  if (order.derivedState === 'cancelled') return 'Cancelled';
  return 'Approved';
}

function getApprovalSummary(order: PaymentOrder) {
  const evaluation = order.reconciliationDetail?.approvalEvaluation;
  if (!evaluation) {
    return order.derivedState === 'draft'
      ? 'This payment has not entered approval yet.'
      : 'Approval context is not available yet.';
  }
  if (!evaluation.requiresApproval) {
    return `Auto-cleared by ${evaluation.policyName}.`;
  }
  return evaluation.reasons.map((reason) => reason.message).join(' ') || 'Approval is required by policy.';
}

function getExecutionLabel(order: PaymentOrder) {
  if (order.derivedState === 'ready_for_execution') return 'Ready to sign';
  if (order.derivedState === 'execution_recorded') return 'Submitted';
  if (order.derivedState === 'settled' || order.derivedState === 'closed') return 'Completed';
  if (order.derivedState === 'exception' || order.derivedState === 'partially_settled') return 'Needs review';
  return 'Not started';
}

function getSettlementLabel(order: PaymentOrder) {
  if (order.derivedState === 'settled' || order.derivedState === 'closed') return 'Matched';
  if (order.derivedState === 'partially_settled') return 'Partial';
  if (order.derivedState === 'exception') return 'Needs review';
  return 'Waiting';
}

function labelState(state: string) {
  return state.replaceAll('_', ' ');
}

function toneForState(state: string) {
  const normalized = state.toLowerCase();
  if (normalized.includes('settled') || normalized.includes('complete') || normalized.includes('approved') || normalized.includes('matched') || normalized.includes('sufficient')) return 'success';
  if (normalized.includes('partial') || normalized.includes('waiting') || normalized.includes('ready') || normalized.includes('pending') || normalized.includes('unknown')) return 'warning';
  if (normalized.includes('exception') || normalized.includes('review') || normalized.includes('cancel') || normalized.includes('insufficient')) return 'danger';
  return 'neutral';
}

function getFormString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = getFormString(formData, key);
  return value || null;
}

function normalizeDateInput(value: string | null) {
  if (!value) return undefined;
  return value.includes('T') ? new Date(value).toISOString() : new Date(`${value}T00:00:00`).toISOString();
}

function usdcToRaw(value: string) {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length > 6) return trimmed;
  const [wholePart, decimalPart = ''] = trimmed.split('.');
  if (!/^\d+$/.test(wholePart || '0') || !/^\d*$/.test(decimalPart)) {
    throw new Error('Amount must be a valid USDC number.');
  }
  const decimals = decimalPart.padEnd(6, '0').slice(0, 6);
  return `${wholePart || '0'}${decimals}`.replace(/^0+(?=\d)/, '') || '0';
}

function yesNo(value: boolean) {
  return value ? 'yes' : 'no';
}

function walletLabel(address: Pick<WorkspaceAddress, 'displayName' | 'address'> | null | undefined) {
  if (!address) return null;
  return address.displayName ?? shortenAddress(address.address);
}

function getPreparedPacket(order: PaymentOrder | undefined): PaymentExecutionPacket | null {
  const records = order?.reconciliationDetail?.executionRecords ?? [];
  for (const record of records) {
    const packet = (record.metadataJson as { executionPacket?: unknown } | undefined)?.executionPacket;
    if (isPaymentExecutionPacket(packet)) return packet;
  }
  return null;
}

function isPaymentExecutionPacket(value: unknown): value is PaymentExecutionPacket {
  return Boolean(value && typeof value === 'object' && 'kind' in value && 'instructions' in value);
}

function timelineLabel(item: ReconciliationTimelineItem) {
  switch (item.timelineType) {
    case 'request_event':
      return {
        type: item.eventType.replaceAll('_', ' '),
        description: item.afterState ? `${item.beforeState ?? 'created'} -> ${item.afterState}` : 'Request event recorded.',
        createdAt: item.createdAt,
      };
    case 'request_note':
      return { type: 'note', description: item.body, createdAt: item.createdAt };
    case 'approval_decision':
      return { type: item.action.replaceAll('_', ' '), description: item.comment ?? 'Approval decision recorded.', createdAt: item.createdAt };
    case 'execution_record':
      return { type: 'execution', description: `${item.executionSource} / ${item.state}`, createdAt: item.createdAt };
    case 'observed_execution':
      return { type: 'observed execution', description: `${item.status} at slot ${item.slot}`, createdAt: item.createdAt };
    case 'match_result':
      return { type: item.matchStatus.replaceAll('_', ' '), description: item.explanation, createdAt: item.createdAt };
    case 'exception':
      return { type: item.reasonCode.replaceAll('_', ' '), description: item.explanation, createdAt: item.createdAt };
  }
}

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
