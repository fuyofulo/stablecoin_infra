/**
 * Cheap re-check: read state.json, look up the recipient ATA, print
 * its balance. Use this to see if Hydra eventually delivered without
 * burning more SOL on a fresh transfer.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';

const L1_RPC = 'https://api.devnet.solana.com';
const STATE_FILE = join(import.meta.dir, 'state.json');

if (!existsSync(STATE_FILE)) {
  console.error('No state.json — run `bun run transfer` once first.');
  process.exit(2);
}

const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
  recipientSecretKey: string;
  mint: string;
};

const recipient = Keypair.fromSecretKey(bs58.decode(state.recipientSecretKey));
const mint = new PublicKey(state.mint);
const ata = getAssociatedTokenAddressSync(mint, recipient.publicKey);

const c = new Connection(L1_RPC, 'confirmed');

console.log(`recipient : ${recipient.publicKey.toBase58()}`);
console.log(`mint      : ${mint.toBase58()}`);
console.log(`ata       : ${ata.toBase58()}`);

try {
  const acct = await getAccount(c, ata);
  console.log(`balance   : ${acct.amount}`);
  if (acct.amount > 0n) {
    console.log('STATUS    : Hydra delivered ✓');
  } else {
    console.log('STATUS    : ATA exists but empty (no Hydra delivery yet)');
  }
} catch {
  console.log('STATUS    : ATA does not exist (Hydra never created it)');
}
