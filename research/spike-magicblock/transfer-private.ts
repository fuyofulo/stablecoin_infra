/**
 * Spike: send a private SPL transfer through MagicBlock's ephemeral-spl-token
 * program on devnet. Vanilla keypair as sender — Squads compatibility is the
 * NEXT spike, this one only validates the protocol works end-to-end at all.
 *
 * Reusable: persists sender/recipient/mint to state.json so re-running
 * doesn't burn rent on a fresh mint and recipient each time. The init
 * pass is idempotent — if the vault + queue already exist for the mint,
 * the script skips it.
 *
 * Pass criteria: recipient ATA holds the transferred amount, no manual
 * intervention. As of MagicBlock's own docs, Private Payments is in
 * beta — devnet Hydra delivery is currently unobserved.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import {
  delegateTransferQueueIx,
  deriveTransferQueue,
  deriveVault,
  initTransferQueueIx,
  transferSpl,
} from '@magicblock-labs/ephemeral-rollups-sdk';

const L1_RPC = 'https://api.devnet.solana.com';
const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const STATE_FILE = join(import.meta.dir, 'state.json');

const TRANSFER_AMOUNT = 1_000_000n; // 1 token (6 decimals)
const POLL_INTERVAL_MS = 2_000;
const POLL_BUDGET_MS = 60_000;

type State = {
  recipientSecretKey: string;
  mint: string;
};

async function main() {
  const l1 = new Connection(L1_RPC, 'confirmed');

  const sender = loadSender();
  log('sender', sender.publicKey.toBase58());

  const balance = await l1.getBalance(sender.publicKey);
  log('sender.balance', `${balance / 1e9} SOL`);

  const state = loadOrCreateState(l1, sender);
  const recipient = Keypair.fromSecretKey(bs58.decode((await state).recipientSecretKey));
  const mint = new PublicKey((await state).mint);
  log('recipient', recipient.publicKey.toBase58());
  log('mint', mint.toBase58());

  const senderAta = await getOrCreateAssociatedTokenAccount(l1, sender, mint, sender.publicKey);
  log('sender.ata', senderAta.address.toBase58());

  // Top up sender if balance is low (we mint a lot the first time and
  // may need more for repeat tests).
  if (senderAta.amount < TRANSFER_AMOUNT) {
    await mintTo(l1, sender, mint, senderAta.address, sender, 10_000_000n);
    log('mint.minted', '10 tokens to sender ATA');
  } else {
    log('sender.ata.balance', `${senderAta.amount} (sufficient)`);
  }

  const recipientAtaAccount = await getOrCreateAssociatedTokenAccount(
    l1,
    sender,
    mint,
    recipient.publicKey,
  );
  log('recipient.ata', recipientAtaAccount.address.toBase58());

  // ── Phase 1: cold-start init for this (mint, validator) ───────────────
  // Idempotent: skip if the vault PDA already exists (which means a prior
  // run completed init).
  const [vaultPda] = deriveVault(mint);
  const vaultExists = (await l1.getAccountInfo(vaultPda)) !== null;
  if (vaultExists) {
    log('init', 'skipping — vault already initialized for this mint');
  } else {
    log('init', 'building cold-start init ix (one-time per mint+validator)');
    const initPrefix = await transferSpl(
      sender.publicKey,
      recipient.publicKey,
      mint,
      0n,
      {
        visibility: 'private',
        fromBalance: 'base',
        toBalance: 'base',
        validator: TEE_VALIDATOR,
        shuttleId: 0,
        privateTransfer: { minDelayMs: 0n, maxDelayMs: 0n, split: 1 },
        initVaultIfMissing: true,
      },
    );
    const vaultInitIxs = initPrefix.slice(0, 3);

    const [queue] = deriveTransferQueue(mint, TEE_VALIDATOR);
    const queueInitIx = initTransferQueueIx(sender.publicKey, queue, mint, TEE_VALIDATOR, 16);
    const queueDelegateIx = delegateTransferQueueIx(queue, sender.publicKey, mint);

    const allInitIxs = [...vaultInitIxs, queueInitIx, queueDelegateIx];
    log('init', `${allInitIxs.length} ix queued`);

    const initSig = await sendAndConfirmTransaction(
      l1,
      new Transaction().add(...allInitIxs),
      [sender],
      { commitment: 'confirmed' },
    );
    log('init.tx', initSig);
  }

  // ── Phase 2: the actual private transfer ──────────────────────────────
  log('build', 'transferSpl visibility=private base→base (transfer-only)');
  const transferIxs = await transferSpl(
    sender.publicKey,
    recipient.publicKey,
    mint,
    TRANSFER_AMOUNT,
    {
      visibility: 'private',
      fromBalance: 'base',
      toBalance: 'base',
      validator: TEE_VALIDATOR,
      shuttleId: Math.floor(Math.random() * 0xffff_ffff),
      privateTransfer: {
        minDelayMs: 0n,
        maxDelayMs: 5_000n,
        split: 1,
      },
      initVaultIfMissing: false,
      initAtasIfMissing: false,
    },
  );
  log('build', `${transferIxs.length} instruction(s) returned`);

  const tx = new Transaction().add(...transferIxs);
  log('submit', 'sending L1 transfer tx');
  const txSig = await sendAndConfirmTransaction(l1, tx, [sender], {
    commitment: 'confirmed',
    skipPreflight: false,
  });
  log('submit.tx', txSig);
  log('submit.explorer', `https://explorer.solana.com/tx/${txSig}?cluster=devnet`);

  const senderAtaAfter = await getAccount(l1, senderAta.address);
  log('sender.ata.balance', `${senderAtaAfter.amount}`);

  const recipientAta = recipientAtaAccount.address;
  log('poll', `watching ${recipientAta.toBase58()} for Hydra delivery`);

  const start = Date.now();
  while (Date.now() - start < POLL_BUDGET_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const account = await getAccount(l1, recipientAta);
      if (account.amount >= TRANSFER_AMOUNT) {
        log('result.balance', `${account.amount}`);
        log('result', 'PASS — recipient received the private transfer');
        return;
      }
    } catch {
      process.stdout.write('.');
    }
  }
  process.stdout.write('\n');
  log(
    'result',
    `INCONCLUSIVE — Hydra hasn't delivered in ${POLL_BUDGET_MS}ms.\n` +
      `              Re-check anytime: bun run check`,
  );
}

async function loadOrCreateState(l1: Connection, payer: Keypair): Promise<State> {
  if (existsSync(STATE_FILE)) {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
    log('state', `loaded from ${STATE_FILE}`);
    return raw;
  }
  log('state', 'no state.json — minting fresh recipient + mint (one-time)');
  const recipient = Keypair.generate();
  const mint = await createMint(l1, payer, payer.publicKey, null, 6);
  const next: State = {
    recipientSecretKey: bs58.encode(recipient.secretKey),
    mint: mint.toBase58(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  log('state', `wrote ${STATE_FILE}`);
  return next;
}

function loadSender(): Keypair {
  const secret = process.env.SENDER_SECRET_KEY?.trim();
  if (secret) {
    if (secret.startsWith('[')) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
    }
    return Keypair.fromSecretKey(bs58.decode(secret));
  }
  const fresh = Keypair.generate();
  console.log('No SENDER_SECRET_KEY set. Generated a fresh sender.');
  console.log('Save this secret and re-export it before re-running:');
  console.log(`  export SENDER_SECRET_KEY=${bs58.encode(fresh.secretKey)}`);
  console.log(`Fund it on devnet: https://faucet.solana.com/?address=${fresh.publicKey.toBase58()}`);
  process.exit(2);
}

function log(key: string, value: string) {
  console.log(`[${key.padEnd(18)}] ${value}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
