# Stale Registry Caused Newly Created Request To Miss Matching

## Summary

This document describes a real failure mode in a Yellowstone-based settlement matcher:

- the transaction was ingested correctly
- the observed USDC legs were reconstructed correctly
- the expected destination wallet received the right partial amount
- but no settlement match was produced

The root cause was not parsing, storage, or allocator math.

The root cause was **stale control-plane matching state inside the worker**:

- the worker matched against a cached workspace/request registry
- the cache default refresh interval was `60s`
- the destination wallet and transfer request had been created only seconds before the transaction
- the transaction arrived before the worker refreshed that cache
- matching is one-shot at ingest time, so the miss persisted

This is a useful standalone incident because the symptom looks like “matching is broken,” while the real problem is “matching state was too stale at the moment of ingest.”

## Concrete Incident

Observed transaction signature:

- `sqft2ZDgWoV4XuupBJijcuMX8KJiLt5CNhJeK3FqxXUC79bf56hH1mhhjfWbbi79Z5jtrMqM3L9cfPzPP5PbD8M`

Observed USDC movement in the product:

- `0.009213` to expected destination wallet `PGm4dkZcqPTkYKqAjNtAokVwJirJB8XQcGpYWBVcFMW`
- `0.000787` to fee wallet `7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE`

Expected behavior:

- the request for `0.010000` USDC should have been marked `matched_partial`
- matched amount should have been `0.009213`

Actual behavior:

- observed transfers and payments were written
- no row was written to `settlement_matches`
- no partial match appeared in the product

## What We Verified

We checked both ClickHouse and Postgres.

### ClickHouse proved parsing and reconstruction were correct

The transaction existed in:

- `observed_transfers`
- `observed_payments`

The stored rows showed:

- one payment to the expected destination wallet for `9213` raw units
- one payment to the fee wallet for `787` raw units

So:

- Yellowstone delivered the transaction
- the transaction parser worked
- transfer reconstruction worked
- payment reconstruction worked

### ClickHouse proved matching never happened

There was:

- no `settlement_matches` row for the signature
- no `request_book_snapshots` row for the destination wallet

That means the failure happened before or during candidate selection, not after successful allocation.

### Postgres proved the request existed in time

The transfer request existed in Postgres:

- destination wallet: `PGm4dkZcqPTkYKqAjNtAokVwJirJB8XQcGpYWBVcFMW`
- requested amount: `10000` raw units
- status: `submitted`
- request time: `2026-04-07 15:14:23.424 UTC`

The workspace wallet also existed before the transaction:

- wallet creation time: `2026-04-07 15:14:08.586 UTC`

The observed transaction time was:

- `2026-04-07 15:14:39.875 UTC`

So the state timeline was:

- workspace wallet created about `31.3s` before the tx
- transfer request created about `16.5s` before the tx
- transaction arrived after both existed

The normal matching window absolutely allowed the match.

## Why The Match Was Missed

The worker did not read Postgres directly while matching.

It matched using a cached control-plane registry containing:

- known workspace wallet addresses
- pending transfer requests per destination wallet

At the time of the incident:

- the worker cache refresh interval defaulted to `60s`
- the wallet and request were newer than the worker cache snapshot

So when the worker handled the transaction:

1. the transaction was parsed
2. the observed payments were reconstructed
3. matching looked up the destination wallet in the cached registry
4. the cached registry did not yet include the fresh wallet/request state
5. the worker skipped matching for that payment
6. the transaction was never revisited

This is why the system showed real observed movement but no partial match.

## Why This Was Easy To Misdiagnose

The product symptom strongly suggests:

- allocator bug
- partial-match explanation bug
- ClickHouse write bug
- parser bug

But all of those were false in this case.

The tricky part is that ingestion can be perfectly correct while matching still fails if:

- state needed for matching is cached separately
- that state refreshes too slowly
- matching only happens once at transaction ingest time

## Things We Considered But Rejected

### 1. The partial-match allocator was wrong

Rejected because:

- allocator logic already supported partial fills correctly
- existing tests for `matched_partial` and `matched_split` passed
- the missing match occurred before any allocation rows were written

### 2. The transaction parser or payment reconstruction was wrong

Rejected because:

- `observed_transfers` and `observed_payments` contained the correct amounts and destinations

### 3. ClickHouse failed to persist the match rows after allocation

Rejected because:

- there was no evidence that allocation happened at all
- there were no book snapshots or match rows for this signature

### 4. The request was outside the matching window

Rejected because:

- request time and transaction time were only seconds apart
- well inside the configured window

## Root Cause

The real root cause was:

- **matching depended on a stale in-memory registry**
- **the refresh interval was too large for newly created wallet/request state**
- **there was no repair path for transactions that were observed before the next refresh**

In short:

- the worker was correct about the transaction
- the worker was wrong about the latest control-plane state

## Fix

We applied two fixes.

### Fix 1: reduce the default registry refresh interval

Changed:

- default `WORKSPACE_REFRESH_INTERVAL_SECONDS`
- from `60`
- to `1`

Why:

- newly created workspace wallets and transfer requests need to become matchable almost immediately
- a 60 second default is too large for operator workflows where a request is created and funded within seconds

### Fix 2: add a one-shot fresh-registry retry for matching

We added a targeted retry path:

- if a payment goes to a wallet already known to the current registry
- but the registry shows no eligible pending requests for that wallet
- the worker performs a one-time fresh registry refresh
- then retries matching against the new snapshot

Why this helps:

- it catches the case where the wallet is already known but the newly created request is not yet in the cached snapshot
- it avoids bringing back the old pathological behavior of unconditional control-plane refresh on every transaction

Rate limiting:

- the forced retry is gated by a small minimum cache age so the worker does not thrash the control plane

## Why We Did Not Use A Full Forced Refresh On Every Miss

That approach would be simpler conceptually, but it would be wrong operationally.

If every unmatched payment forced a control-plane refresh, then:

- unrelated external transfers would trigger network I/O
- ingest throughput would degrade
- we could easily recreate the earlier Yellowstone backlog problem

So the fix had to be selective.

## Limitations Of The Current Fix

This fix materially reduces the failure window, but it does not make the system perfect.

Remaining limitation:

- if a brand new workspace wallet is created and funded before the next periodic refresh, and the current registry does not know that wallet at all, the one-shot retry will not trigger unless the periodic refresh already caught it

That is why reducing the periodic refresh interval to `1s` was also necessary.

## Stronger Long-Term Solution

The robust long-term architecture is:

- keep fast periodic registry refresh
- and add a recent-unmatched rematch path

That rematch path would:

1. refresh workspace/request registry
2. scan recent observed payments with no settlement matches
3. rerun matching with current registry state
4. upsert any newly valid partial/exact matches

That design handles:

- newly created workspace wallets
- newly created requests
- temporary control-plane staleness
- worker restarts

without requiring the original transaction to be replayed from Yellowstone.

## Verification After The Fix

We verified:

- Yellowstone unit tests pass
- the repo-wide test suite passes
- new regression tests cover:
  - retry when wallet exists but request is missing in the current registry snapshot
  - no retry when a valid request is already present

## Reusable Lessons

If you build a Solana settlement matcher with Yellowstone, control-plane state, and ClickHouse:

1. Do not treat “transaction observed” and “transaction matchable” as the same thing.
2. If matching depends on cached off-chain state, measure cache staleness explicitly.
3. A large refresh interval can silently create missed matches even when ingestion is healthy.
4. One-shot ingest-time matching is fragile unless you also support rematch/backfill.
5. Avoid solving staleness by adding unconditional per-transaction network refreshes. That usually converts a correctness bug into a throughput bug.

## Files Changed For This Fix

- `yellowstone/src/config.rs`
- `yellowstone/src/control_plane.rs`
- `yellowstone/src/yellowstone/mod.rs`

## Practical Diagnostic Checklist

When you see “observed movement exists but no match exists,” check in this order:

1. Does the transaction exist in `observed_transfers`?
2. Does it exist in `observed_payments`?
3. Does `settlement_matches` contain anything for the signature?
4. Does `request_book_snapshots` contain the transfer request?
5. Did the transfer request exist in Postgres before the transaction time?
6. Did the workspace wallet itself exist before the transaction time?
7. What was the worker’s registry refresh interval at that time?
8. Is there any rematch/backfill path for recently unmatched observations?

If 1 and 2 are true, 3 and 4 are false, and 5 and 6 are true, then stale matching state is a very likely culprit.
