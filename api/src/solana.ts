import { Connection, PublicKey, type TransactionInstruction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { config, type SolanaNetwork } from './config.js';

export const SOLANA_CHAIN = 'solana';
export const USDC_ASSET = 'usdc';
export const USDC_DECIMALS = 6;
const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const USDC_MINT = getUsdcMint();
export const SOLANA_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export function getUsdcMint(network: SolanaNetwork = config.solanaNetwork): PublicKey {
  return network === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
}

let connectionSingleton: Connection | null = null;
export function getSolanaConnection(): Connection {
  if (!connectionSingleton) {
    connectionSingleton = new Connection(config.solanaRpcUrl, 'confirmed');
  }
  return connectionSingleton;
}

let devnetConnectionSingleton: Connection | null = null;

/**
 * Connection pinned to SOLANA_DEVNET_RPC_URL, regardless of the app's
 * primary SOLANA_NETWORK. Used for devnet reads (balances, signature
 * polling) — typically a paid provider for better rate limits.
 *
 * Do NOT use this for `requestAirdrop` — premium RPC providers
 * (Alchemy, Helius, etc.) explicitly disable that method and return
 * "Invalid request". Use getSolanaAirdropConnection() instead.
 */
export function getSolanaDevnetConnection(): Connection {
  if (!devnetConnectionSingleton) {
    devnetConnectionSingleton = new Connection(config.solanaDevnetRpcUrl, 'confirmed');
  }
  return devnetConnectionSingleton;
}

let airdropConnectionSingleton: Connection | null = null;

/**
 * Connection pinned to a node that allows `requestAirdrop`. Defaults
 * to Solana's public devnet endpoint (https://api.devnet.solana.com)
 * — premium providers like Alchemy disable the airdrop method.
 * Override via SOLANA_AIRDROP_RPC_URL if a different faucet-allowing
 * endpoint is preferred.
 *
 * Once the airdrop signature is returned, callers can poll its status
 * on getSolanaDevnetConnection() (the faster Alchemy URL) — both
 * read the same chain state.
 */
export function getSolanaAirdropConnection(): Connection {
  if (!airdropConnectionSingleton) {
    airdropConnectionSingleton = new Connection(config.solanaAirdropRpcUrl, 'confirmed');
  }
  return airdropConnectionSingleton;
}

/**
 * Poll getSignatureStatuses until the signature is at least 'confirmed'
 * (or 'finalized'), or until the timeout elapses. Blockhash-agnostic
 * alternative to Connection.confirmTransaction(strategy) — doesn't fail
 * with "block height exceeded" when the tx actually landed but the
 * intent's recentBlockhash window is already past.
 *
 * Returns { confirmed, seen } — `seen` is true if the RPC has any
 * record of the signature (lets callers distinguish "tx never landed"
 * from "tx landed, just didn't reach confirmed in our window").
 *
 * Throws if the network reports the tx errored on chain.
 */
export async function waitForSignatureVisible(
  connection: Connection,
  signature: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<{ confirmed: boolean; seen: boolean }> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const deadline = Date.now() + timeoutMs;
  let everSeen = false;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      everSeen = true;
      if (status.err) {
        throw new Error(`On-chain error: ${JSON.stringify(status.err)}`);
      }
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return { confirmed: true, seen: true };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return { confirmed: false, seen: everSeen };
}

export type SolanaBalances = {
  solLamports: string;
  usdcRaw: string | null;
  rpcError: string | null;
};

export async function fetchWalletBalances(args: {
  walletAddress: string;
  usdcAtaAddress: string | null;
}): Promise<SolanaBalances> {
  const connection = getSolanaConnection();
  try {
    const walletPubkey = new PublicKey(args.walletAddress);
    const [lamports, usdc] = await Promise.all([
      connection.getBalance(walletPubkey).catch(() => null),
      args.usdcAtaAddress
        ? connection.getTokenAccountBalance(new PublicKey(args.usdcAtaAddress)).catch(() => null)
        : Promise.resolve(null),
    ]);
    return {
      solLamports: lamports === null ? '0' : String(lamports),
      usdcRaw: usdc?.value.amount ?? null,
      rpcError: lamports === null ? 'Wallet balance unavailable' : null,
    };
  } catch (error) {
    return {
      solLamports: '0',
      usdcRaw: null,
      rpcError: error instanceof Error ? error.message : 'Balance lookup failed',
    };
  }
}

export function isSolanaSignatureLike(value: string) {
  return SOLANA_SIGNATURE_PATTERN.test(value);
}

export function deriveUsdcAtaForWallet(walletAddress: string) {
  const owner = new PublicKey(walletAddress);
  return getAssociatedTokenAddressSync(USDC_MINT, owner, true).toBase58();
}

export type SerializedSolanaInstruction = {
  programId: string;
  keys: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64: string;
};

export function serializeSolanaInstruction(instruction: TransactionInstruction) {
  return {
    programId: instruction.programId.toBase58(),
    keys: instruction.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    dataBase64: Buffer.from(instruction.data).toString('base64'),
  } satisfies SerializedSolanaInstruction;
}

export function buildUsdcTransferInstructions(args: {
  sourceWallet: string;
  sourceTokenAccount: string;
  destinationWallet: string;
  destinationTokenAccount: string;
  amountRaw: string | bigint;
}) {
  return buildUsdcTransferTransactionInstructions(args).map(serializeSolanaInstruction);
}

export function buildUsdcTransferTransactionInstructions(args: {
  sourceWallet: string;
  sourceTokenAccount: string;
  destinationWallet: string;
  destinationTokenAccount: string;
  amountRaw: string | bigint;
}) {
  const sourceWallet = new PublicKey(args.sourceWallet);
  const sourceTokenAccount = new PublicKey(args.sourceTokenAccount);
  const destinationWallet = new PublicKey(args.destinationWallet);
  const destinationTokenAccount = new PublicKey(args.destinationTokenAccount);

  const ensureDestinationAta = createAssociatedTokenAccountIdempotentInstruction(
    sourceWallet,
    destinationTokenAccount,
    destinationWallet,
    USDC_MINT,
  );
  const transfer = createTransferCheckedInstruction(
    sourceTokenAccount,
    USDC_MINT,
    destinationTokenAccount,
    sourceWallet,
    BigInt(args.amountRaw),
    USDC_DECIMALS,
    [],
    TOKEN_PROGRAM_ID,
  );

  return [ensureDestinationAta, transfer];
}
