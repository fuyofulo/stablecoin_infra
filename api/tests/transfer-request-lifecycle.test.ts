import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deriveExecutionState,
  deriveRequestDisplayState,
  getAvailableUserTransitions,
  isRequestStatusTransitionAllowed,
  isUserRequestStatusTransitionAllowed,
} from '../src/transfer-request-lifecycle.js';

test('request lifecycle exposes the allowed transition graph', () => {
  assert.equal(isRequestStatusTransitionAllowed('draft', 'submitted'), true);
  assert.equal(isRequestStatusTransitionAllowed('submitted', 'approved'), true);
  assert.equal(isRequestStatusTransitionAllowed('pending_approval', 'escalated'), true);
  assert.equal(isRequestStatusTransitionAllowed('observed', 'matched'), true);
  assert.equal(isRequestStatusTransitionAllowed('matched', 'closed'), true);
  assert.equal(isRequestStatusTransitionAllowed('closed', 'submitted'), false);
});

test('user transition graph is stricter than the full lifecycle graph', () => {
  assert.equal(isUserRequestStatusTransitionAllowed('draft', 'submitted'), true);
  assert.equal(isUserRequestStatusTransitionAllowed('submitted_onchain', 'observed'), false);
  assert.equal(isUserRequestStatusTransitionAllowed('exception', 'closed'), true);
  assert.deepEqual(getAvailableUserTransitions('approved'), []);
});

test('request display state derives from request status, match status, and open exceptions', () => {
  assert.equal(
    deriveRequestDisplayState({
      requestStatus: 'submitted',
      matchStatus: null,
      exceptionStatuses: [],
    }),
    'pending',
  );

  assert.equal(
    deriveRequestDisplayState({
      requestStatus: 'submitted',
      matchStatus: 'matched_exact',
      exceptionStatuses: [],
    }),
    'matched',
  );

  assert.equal(
    deriveRequestDisplayState({
      requestStatus: 'submitted',
      matchStatus: 'matched_partial',
      exceptionStatuses: [],
    }),
    'partial',
  );

  assert.equal(
    deriveRequestDisplayState({
      requestStatus: 'submitted',
      matchStatus: 'matched_partial',
      exceptionStatuses: ['open'],
    }),
    'exception',
  );
});

test('execution state derives separately from approval, observation, and match facts', () => {
  assert.equal(
    deriveExecutionState({
      requestStatus: 'approved',
      executionState: null,
      submittedSignature: null,
      hasObservedTransaction: false,
      matchStatus: null,
      exceptionStatuses: [],
    }),
    'ready_for_execution',
  );

  assert.equal(
    deriveExecutionState({
      requestStatus: 'submitted_onchain',
      executionState: 'submitted_onchain',
      submittedSignature: 'sig',
      hasObservedTransaction: false,
      matchStatus: null,
      exceptionStatuses: [],
    }),
    'submitted_onchain',
  );

  assert.equal(
    deriveExecutionState({
      requestStatus: 'submitted_onchain',
      executionState: 'submitted_onchain',
      submittedSignature: 'sig',
      hasObservedTransaction: true,
      matchStatus: null,
      exceptionStatuses: [],
    }),
    'observed',
  );

  assert.equal(
    deriveExecutionState({
      requestStatus: 'submitted_onchain',
      executionState: 'submitted_onchain',
      submittedSignature: 'sig',
      hasObservedTransaction: true,
      matchStatus: 'matched_exact',
      exceptionStatuses: [],
    }),
    'settled',
  );

  assert.equal(
    deriveExecutionState({
      requestStatus: 'submitted_onchain',
      executionState: 'submitted_onchain',
      submittedSignature: 'sig',
      hasObservedTransaction: true,
      matchStatus: null,
      exceptionStatuses: ['open'],
    }),
    'execution_exception',
  );
});
