# Axoria Grafana

Grafana is a read-only operations surface for the Axoria data pipeline.

## Run

```sh
make grafana-up
```

Then open `http://127.0.0.1:3001`.

Default local credentials are `admin` / `admin`. Override them with:

```sh
GRAFANA_ADMIN_USER=... GRAFANA_ADMIN_PASSWORD=... make grafana-up
```

## Provisioned Data Sources

- `Axoria ClickHouse`: operational event store for Yellowstone ingestion, reconstructed USDC payments, matching, exceptions, and latency.
- `Axoria Postgres`: control-plane state for organizations, workspaces, payment requests, payment orders, approvals, and execution records.

## Provisioned Dashboard

`Axoria Operations` tracks:

- Relevant USDC transactions observed by the worker.
- Settlement matches.
- Open exceptions.
- Active control-plane requests.
- Worker write latency.
- Observed-to-matched latency.
- Latest relevant payments.

Grafana does not sit in the write path. It only reads from ClickHouse and Postgres.
