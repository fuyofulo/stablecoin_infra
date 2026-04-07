# Yellowstone Latency Backlog Incident

## Summary

This document describes a real production-like failure mode in a Yellowstone-based Solana ingestion pipeline:

- observed transaction latency appeared to come from Yellowstone
- `yellowstone_to_worker_ms` kept increasing over time
- ClickHouse began throwing `MEMORY_LIMIT_EXCEEDED` during `WaitForAsyncInsert`
- the system gradually fell behind the chain and became operationally unusable

The final result was **not** a single bug. It was a compound throughput problem with two distinct local bottlenecks:

1. a control-plane refresh on every transaction in the worker hot path
2. too many high-frequency async insert waits against ClickHouse, especially for `observed_transfers`

This write-up is intended to be reusable as a standalone bug report and solution guide for similar Solana + Yellowstone + ClickHouse ingestion systems.

## Context

System shape:

- upstream stream source: Yellowstone gRPC
- chain: Solana
- asset scope: USDC
- worker language: Rust
- analytical store: ClickHouse

The worker subscribes to Yellowstone, reconstructs:

- observed transactions
- observed transfers
- observed payments
- matcher events and settlement matches

and writes those into ClickHouse.

## Primary Symptoms

The system initially looked healthy, then degraded over time.

Observed symptoms:

- recent transactions were missing from the product for too long
- the worker stayed alive but remained behind current slots
- `yellowstone_to_worker_ms` rose monotonically instead of staying stable
- ClickHouse eventually emitted:
  - `Code: 241`
  - `MEMORY_LIMIT_EXCEEDED`
  - `While executing WaitForAsyncInsert`

Representative runtime error:

```text
Failed to insert observed transfers batch: ClickHouse HTTP 500 Internal Server Error:
Code: 241. DB::Exception: (total) memory limit exceeded ...
While executing WaitForAsyncInsert. (MEMORY_LIMIT_EXCEEDED)
```

## What We Measured

To stop guessing, we instrumented the worker and added latency reporting.

### Fields added

We added these fields to `observed_transactions`:

- `yellowstone_created_at`
- `worker_received_at`

This gave us:

- when Yellowstone says the update was created
- when our worker actually began handling it
- when we wrote transaction rows
- when we wrote payment rows
- when matching happened

### Report command

We added:

- `make latency-report`

This reports:

- `yellowstone_to_worker_ms`
- `worker_to_tx_write_ms`
- `worker_to_payment_write_ms`
- `worker_to_match_ms`
- `event_to_tx_write_ms`

### What the numbers showed

At multiple points we saw:

- `worker_to_tx_write_ms` roughly `50-140 ms`
- `worker_to_payment_write_ms` roughly `160-260 ms`

while at the same time:

- `yellowstone_to_worker_ms` rose from about `11-19 s`
- then to about `88-90 s`
- then to about `150-220 s`

This was the key insight:

- **our local post-receive write path was fast**
- **the queue before actual worker handling was growing**

That means the system was not simply “ClickHouse is slow at every stage.”

It meant:

- the worker could not keep up with stream volume
- backlog depth was growing
- each subsequent transaction waited longer before being processed

## Important Measurement Caveat

`yellowstone_to_worker_ms` is:

- `yellowstone_created_at -> worker_received_at`

It is **not** true canonical:

- `chain block time -> worker_received_at`

So this metric proves backlog between Yellowstone-emitted updates and our worker processing them, but it does **not** prove where upstream validator-side delay begins.

Even with that caveat, the metric was still sufficient to diagnose our local backlog because:

- our post-receive path timings were stable
- the pre-receive queueing kept increasing

## Things We Initially Thought Might Be The Problem

These were all reasonable hypotheses. They were not the final answer by themselves.

### 1. Yellowstone itself was just slow

Why we thought this:

- the reported delay sat in `yellowstone_to_worker_ms`
- the system was many slots behind

Why this was incomplete:

- our own code was creating backlog before handling updates
- once a transaction reached the worker, local write timings were low

Conclusion:

- Yellowstone might still add some latency
- but it was not the whole story

### 2. ClickHouse writes were slow in general

Why we thought this:

- we saw `WaitForAsyncInsert`
- we saw `MEMORY_LIMIT_EXCEEDED`

Why this was incomplete:

- transaction and payment write times stayed low for a while
- the earlier and more important signal was the growing pre-processing queue

Conclusion:

- ClickHouse was part of the problem
- but specifically in the high-volume insert pattern, not in every write path equally

### 3. The account subscription was overwhelming the worker

This was a valid suspicion.

Originally we were subscribed to:

- broad USDC account updates
- USDC transaction updates

We reduced the subscription shape to:

- `transactions`
- `blocks_meta`

This was still a useful change, but it did **not** solve the core problem by itself.

Conclusion:

- reducing subscription breadth helped reduce noise
- but the worker still had local hot-path and insert-pressure issues

### 4. Matching logic itself was too slow

Why we considered it:

- matching happens per observed payment
- reconciliation logic can become expensive

Why it was not the main cause:

- write timings after worker receipt stayed low
- the larger delays were already present before matching completed

Conclusion:

- matching was not the dominant bottleneck in this incident

## Root Cause 1: Control-Plane Refresh In The Transaction Hot Path

### The bug

The worker was doing a control-plane registry refresh on every transaction before matching.

Relevant code path before the fix:

- stale-based refresh at the stream loop boundary
- then another unconditional `refresh_now()` per transaction

The expensive part was the registry refresh implementation:

- fetch list of workspaces
- fetch `/internal/workspaces/{id}/matching-context` for each workspace
- retry up to 3 times
- HTTP timeout of 3 seconds

That meant every streamed transaction could trigger:

- extra network I/O
- extra control-plane latency
- extra mutex hold time

### Why this caused queue growth

The stream loop is serial:

- get update
- refresh registry
- process transaction
- write rows
- repeat

If the average per-update handling cost exceeds arrival rate, queue depth grows.

As queue depth grows:

- earlier updates are processed first
- later updates wait longer
- `yellowstone_to_worker_ms` increases monotonically

This is exactly what we saw.

### Fix

We removed the per-transaction forced refresh from the hot path.

New behavior:

- registry refresh remains stale-based at loop level
- transaction processing uses the current cached registry snapshot
- the registry mutex is not held across settlement materialization

Code references:

- [mod.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/yellowstone/mod.rs#L430)
- [control_plane.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/control_plane.rs#L149)

## What Happened After Fix 1

Fixing the control-plane refresh bug was necessary, but not sufficient.

After that fix:

- the worker still fell behind
- ClickHouse started clearly surfacing transfer insert failures
- backlog still grew under load

That told us there was a second independent bottleneck.

## Root Cause 2: ClickHouse Insert Pressure On High-Volume Observed Tables

### The bug

The worker was still inserting:

- `observed_transactions`
- `observed_transfers`
- `observed_payments`

essentially transaction-by-transaction.

Even though the storage layer used chunking internally, the worker still caused a very large number of async inserts because each streamed transaction independently triggered inserts.

The worst table was:

- `observed_transfers`

because it has the highest row volume.

### Why this caused failure

The ClickHouse writer uses:

- `async_insert=1`
- `wait_for_async_insert=1`

That means every insert waits for the async insert pipeline to complete.

With enough small or medium inserts arriving continuously:

- parts accumulate
- merges accumulate
- async insert queue pressure rises
- memory pressure rises
- `WaitForAsyncInsert` starts failing

Representative schema/reference:

- [storage.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/storage.rs)
- [002-schema.sql](/Users/fuyofulo/code/stablecoin_intelligence/clickhouse/init/002-schema.sql#L49)

### Why earlier split-retry logic did not solve it

We already had retry logic that split batches after memory-pressure errors.

That only helps when:

- one particular batch is too large

It does **not** solve:

- too many insert waits overall
- sustained merge pressure
- backlog replay pressure across many transactions

So splitting was only a partial mitigation.

### Fix

We buffered observed settlement rows across multiple streamed transactions before sending them to ClickHouse.

Buffered tables:

- `observed_transactions`
- `observed_transfers`
- `observed_payments`

Flush strategy:

- flush on short interval
- flush on row-count thresholds

This reduces:

- number of insert calls
- number of `wait_for_async_insert` cycles
- part creation pressure
- merge pressure

Code references:

- [mod.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/yellowstone/mod.rs#L224)
- [mod.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/yellowstone/mod.rs#L487)
- [storage.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/storage.rs)

## What Actually Solved The Incident

The incident resolved only after both fixes were in place:

1. remove control-plane refresh from per-transaction hot path
2. batch observed transaction/transfer/payment writes before ClickHouse flush

Fix 1 alone did not solve the issue.
Fix 2 alone would also have been incomplete.

This was a compounded throughput failure.

## Verification After Both Fixes

After restarting the worker with both fixes:

- `yellowstone_to_worker_ms` dropped to about `364-949 ms`
- `worker_to_tx_write_ms` stayed around `64-195 ms`
- no new `observed_transfers` `MEMORY_LIMIT_EXCEEDED` errors appeared during verification soak

That was the first measurement that actually looked healthy.

This is the most important conclusion in the whole report:

- before the final fix, latency grew over time
- after the final fix, latency stayed in sub-second to about one-second range

## Operational Lessons

### 1. Stable write latency does not mean the pipeline is healthy

You can have:

- low per-write latency
- but still have a growing pre-processing queue

Always measure:

- source timestamp
- worker receive timestamp
- write completion timestamp

### 2. Never put external control-plane reads in a streaming hot path

If a stream consumer does per-message network I/O before handling the message:

- throughput becomes coupled to control-plane latency
- queue depth becomes unavoidable under bursts

Use:

- cached snapshots
- stale refresh
- background refresh

### 3. Async inserts can still fail under high insert frequency

`async_insert=1` is not magic.

If you still generate too many insert waits:

- ClickHouse can hit memory/merge pressure
- especially on high-volume derived tables

Batching at the application layer still matters.

### 4. Broad subscription reduction is useful, but it is not a substitute for fixing local bottlenecks

We reduced the subscription from account-heavy to:

- `transactions`
- `blocks_meta`

That was still the right direction, but it did not eliminate:

- local hot-path network calls
- local insert-pressure failure modes

### 5. Measure each boundary explicitly

If you cannot answer these separately, you will guess wrong:

- when the source says the event exists
- when the worker begins handling it
- when writes complete
- when matching completes

## Reproduction Pattern To Watch For In Other Projects

If another ingestion system shows the same shape, suspect the same class of issue.

Red flags:

- latency starts reasonable, then rises continuously
- worker stays alive but falls further behind
- post-receive write times stay low
- source-to-worker delay grows steadily
- ClickHouse emits `WaitForAsyncInsert` memory errors

This usually means:

- queue depth is growing
- the consumer cannot sustain arrival rate

## Recommended Debugging Playbook

Use this order.

### Step 1. Instrument timestamps

Add:

- source-created timestamp
- worker-received timestamp
- write timestamps
- match timestamps

### Step 2. Separate queue delay from write delay

If:

- source-to-worker rises
- worker-to-write stays flat

then the bottleneck is not “general database slowness.”

### Step 3. Eliminate all nonessential per-message I/O

Look for:

- registry refreshes
- metadata fetches
- API calls
- file writes
- expensive logging

### Step 4. Batch the highest-volume writes

Do not rely only on downstream async insert features.
Batch earlier in the producer.

### Step 5. Narrow subscriptions only after local bottlenecks are removed

Otherwise you may confuse:

- “provider is slow”

with:

- “our consumer is overloaded”

## Commands That Were Useful

- `make latest-slot`
- `make latency-report`
- `DEBUG_YELLOWSTONE_PARSED_UPDATES=1 make dev`

These were useful for:

- checking ingest frontier
- measuring stage-by-stage latency
- inspecting parsed Yellowstone updates

## Known Report Artifact

In `make latency-report`, rows with no joined payment row can show:

- `payment_write_at = 1970-01-01`

That is a reporting artifact from the join/default behavior, not a real historical timestamp.

It should not be interpreted as a latency signal.

## Final Diagnosis

The root problem was **not** simply “Yellowstone is slow.”

The real failure mode was:

- a serial stream consumer
- with an unnecessary per-transaction control-plane refresh
- plus excessive async insert pressure on high-volume ClickHouse tables

Those together created a backlog system that looked like upstream latency.

## Final Fix Summary

Implemented:

- remove per-transaction forced registry refresh
- use cached registry snapshot during matching
- batch observed transaction/transfer/payment writes before ClickHouse flush

Validated by:

- passing tests
- live `make latency-report`
- disappearance of transfer insert memory errors during verification

## Files Changed

- [mod.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/yellowstone/mod.rs)
- [control_plane.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/control_plane.rs)
- [storage.rs](/Users/fuyofulo/code/stablecoin_intelligence/yellowstone/src/storage.rs)

