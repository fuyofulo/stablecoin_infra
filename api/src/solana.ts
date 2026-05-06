import { Connection, PublicKey, type TransactionInstruction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { config } from './config.js';

export const SOLANA_CHAIN = 'solana';
export const USDC_ASSET = 'usdc';
export const USDC_DECIMALS = 6;
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const SOLANA_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

let connectionSingleton: Connection | null = null;
export function getSolanaConnection(): Connection {
  if (!connectionSingleton) {
    connectionSingleton = new Connection(config.solanaRpcUrl, 'confirmed');
  }
  return connectionSingleton;
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

  return [ensureDestinationAta, transfer].map(serializeSolanaInstruction);
}
