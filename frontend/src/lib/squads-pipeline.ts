import { Connection, VersionedTransaction } from '@solana/web3.js';
import { api } from '../api';
import type { SquadsConfigProposalIntentResponse } from '../types';
import { resolveSolanaRpcUrl, waitForSignatureVisible } from './solana-wallet';

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Sign a Squads intent with the given personal wallet via the backend Privy
 * signing endpoint, submit to chain, and poll the signature via
 * getSignatureStatuses (blockhash-agnostic). Returns the on-chain signature.
 */
export async function signAndSubmitIntent(args: {
  intent: SquadsConfigProposalIntentResponse;
  signerPersonalWalletId: string;
}): Promise<string> {
  const { intent, signerPersonalWalletId } = args;
  const signed = await api.signPersonalWalletVersionedTransaction(signerPersonalWalletId, {
    serializedTransactionBase64: intent.transaction.serializedTransaction,
  });
  const connection = new Connection(resolveSolanaRpcUrl(), 'confirmed');
  const bytes = decodeBase64ToBytes(signed.signedTransactionBase64);
  VersionedTransaction.deserialize(bytes);
  const sig = await connection.sendRawTransaction(bytes, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  const visible = await waitForSignatureVisible(connection, sig, { timeoutMs: 30_000 });
  if (!visible.confirmed && !visible.seen) {
    throw new Error('Transaction never appeared on chain after submission. Try again.');
  }
  return sig;
}
