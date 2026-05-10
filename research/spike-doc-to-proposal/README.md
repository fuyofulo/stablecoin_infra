# Doc-to-Proposal Spike

Goal: prove that Claude vision can turn an arbitrary invoice/expense document into structured payment rows that drop cleanly into Decimal's existing CSV import pipeline.

If this works on a few real-shaped invoices, the integration is small: a backend route accepts a file upload, calls `extract.ts`'s logic, and feeds the rows into the same `importPaymentRunFromCsv` machinery the manual CSV path already uses.

## What it produces

A JSON array, one element per payment found in the document:

```json
[
  {
    "counterparty": "Acme Corp",
    "amount": 12450.00,
    "currency": "USD",
    "reference": "INV-2026-0042",
    "due_date": "2026-05-31",
    "notes": null
  }
]
```

Wallet addresses are intentionally **not** extracted — invoices rarely contain them. The integration step matches `counterparty` against the org's destination registry to fill in the wallet.

## Run

```bash
cd research/spike-doc-to-proposal
bun install                   # one-time
# .env already has OPEN_ROUTER_API_KEY — Bun auto-loads it
bun run extract samples/your-invoice.pdf
```

Supported inputs: `.pdf .png .jpg .jpeg .webp .gif`.

## Provider

OpenRouter, free tier. Default model is **`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`** — biggest free vision-capable reasoning model that consistently follows the "biller ≠ buyer" rule. JSON-in-text mode (most free models don't honor OpenAI's `tool_choice` so we stopped using tools and parse JSON from the response).

To swap the model, edit the `MODEL` constant at the top of `extract.ts`. Other tested options:
- `openrouter/free` — auto-routes, fast, but non-deterministic (different runs hit different models with different quality)
- `google/gemma-4-31b-it:free` / `google/gemma-4-26b-a4b-it:free` — capable but heavily contested, frequent 429s
- `nvidia/nemotron-nano-12b-v2-vl:free` — fast but too small to follow nuanced instructions reliably

## PDF support

PDFs are auto-converted to PNG via macOS `sips` before being sent to the model (zero deps, ships with the OS). OpenRouter's free `pdf-text` plugin choked on cupsfilter-generated PDFs, and most free vision models can't ingest PDFs natively — converting on our side is the most reliable path.

For a non-macOS port, swap the `sips` shellout in `maybeConvertPdfToPng()` for a Node lib like `pdfjs-dist` + `@napi-rs/canvas`.

## What to drop in `samples/`

For a meaningful spike, throw in 2-3 of:
- A real vendor invoice PDF
- A multi-page PDF with several invoices stitched together
- A photo / scan / screenshot of an invoice
- An expense report with multiple line items

Anything you'd realistically dump into Decimal at month-end. Each one is one `bun run extract` call.

## Pass criteria

- Returns the right number of rows (1 per payment intent in the document)
- Counterparty names match what's printed
- Amount is the actual payable amount (after tax, with line-item sums collapsed)
- Reference matches the invoice number
- Due date is correctly parsed to `YYYY-MM-DD`
- No hallucinated rows when the document is ambiguous

## Cost

$0 — running on OpenRouter's free tier. Free models do have rate limits (typically 50 RPM / 1000 RPD per account). For production we'd swap to a paid model.
