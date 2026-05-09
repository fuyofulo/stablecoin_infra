# MagicBlock Private SPL Transfer — Spike

Goal: prove that MagicBlock's `ephemeral-spl-token` program can deliver a **private base→base SPL transfer** end-to-end on devnet (sender holds USDC normally, recipient receives USDC normally, the link between them is encrypted to the TEE validator and dispatched by the Hydra crank).

If this passes, the next spike is wrapping the same instruction in a Squads v4 vault transaction.

## What this tests

A single call to `transferSpl(from, to, mint, amount, { visibility: 'private', fromBalance: 'base', toBalance: 'base', ... })` from `@magicblock-labs/ephemeral-rollups-sdk@0.13.0`.

Under the hood this builds **discriminator 25 — `depositAndDelegateShuttleEphemeralAtaWithMergeAndPrivateTransferIx`** (19 accounts, 2 signers: `payer` + `owner`), encrypts the recipient pubkey to the validator's Ed25519 key, and submits to Solana devnet. The Hydra crank running inside the TEE validator (`devnet-tee.magicblock.app`, identity `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`) decrypts and forwards within `[minDelayMs, maxDelayMs]`.

## Run

```bash
cd research/spike-magicblock
bun install   # (first time only)
bun run transfer
```

First run with no env var prints a fresh sender keypair + faucet URL and exits. Steps:

1. Run `bun run transfer` — copy the printed `SENDER_SECRET_KEY` and faucet URL.
2. Visit the faucet URL, request 1 SOL on devnet.
3. `export SENDER_SECRET_KEY=<the printed value>` and run `bun run transfer` again.

Pass criteria: the recipient ATA balance reaches the transferred amount within 60s.

## Pubkeys

- Devnet L1 RPC: `https://api.devnet.solana.com`
- Devnet TEE validator: `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo` (same identity as mainnet-tee per docs)
- `EPHEMERAL_SPL_TOKEN_PROGRAM_ID`: `SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2`
- `HYDRA_PROGRAM_ID`: `Hydra17i1feui9deaxu6d1TzSQMRNHeBRkDR1Awy7zea`
- `DELEGATION_PROGRAM_ID`: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
