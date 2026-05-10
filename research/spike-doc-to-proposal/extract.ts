/**
 * Spike: invoice/document → structured payment rows via a vision-capable
 * LLM hosted on OpenRouter. Uses a free model so iteration is cheap.
 *
 * Pass criteria: given a PDF or image of an invoice, return rows that
 * map cleanly to Decimal's CSV import shape (counterparty, amount,
 * reference, due_date). Wallet addresses are NOT extracted — vendor
 * lookup against the destination registry happens at integration time.
 *
 * Usage:
 *   bun run extract samples/some-invoice.pdf
 *   (reads OPEN_ROUTER_API_KEY from .env automatically — Bun's built-in)
 *
 * Output: extraction stats on stderr, JSON rows on stdout.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, basename, join } from 'node:path';
import OpenAI from 'openai';
import { z } from 'zod';

// Free, vision-capable, 30B reasoning — biggest free option that
// handles the "biller != buyer" instruction reliably. JSON-in-text
// mode (we stripped tool_choice because most free models don't honor
// it). If this 429s, fall back to 'nvidia/nemotron-nano-12b-v2-vl:free'
// — weaker, but much less contested.
const MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const RowSchema = z.object({
  counterparty: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1),
  reference: z.string().nullable(),
  due_date: z.string().nullable(),
  notes: z.string().nullable(),
});

const RowsSchema = z.object({
  rows: z.array(RowSchema),
});

const SYSTEM_PROMPT = `You parse vendor invoices into payment rows for a B2B stablecoin payouts platform that *sends* money. Each row represents money LEAVING our platform and going TO a vendor.

OUTPUT FORMAT — return ONLY a JSON object with this exact shape, nothing else (no prose, no markdown fences):

{
  "rows": [
    {
      "counterparty": "string — vendor / payee name (the entity being paid)",
      "amount": number,
      "currency": "string — e.g. USD, EUR, USDC",
      "reference": "string or null — invoice number / reference id",
      "due_date": "string YYYY-MM-DD or null",
      "notes": "string or null — operator-relevant note like 'partial payment'"
    }
  ]
}

CRITICAL RULES:

1. **counterparty = the entity we are PAYING (the BILLER, the FROM/VENDOR side of the invoice).** This is the party that *issued* the invoice and is *waiting to be paid*. Look for "From:", "Vendor:", "Bill from:", "Remit to:", a company name with a logo at the top, or the "billing@..." email. NEVER the recipient/buyer/customer side (which is *our* platform/company that owes them money).

   Example invoice excerpt:
     From: Acme Corp                           To: Decimal Labs Inc.
     1234 Market St                            Attn: Accounts Payable
     billing@acmecorp.com                      contact@decimal.finance

   Correct counterparty: "Acme Corp" — they sent the bill, they get paid.
   WRONG: "Decimal Labs Inc." — that's the buyer/customer, who is paying.

2. **One invoice = ONE row, regardless of how many line items it has.** Five line items totaling $9,928.50 → emit ONE row with amount=9928.50, not five rows. Use TOTAL DUE / GRAND TOTAL (after tax and discounts), not the subtotal or per-item amounts.

3. **Multiple separate invoices in one document = one row per invoice.** A multi-page PDF with 3 distinct invoices from 3 vendors emits 3 rows.

4. Be faithful. Never invent fields. Use null if missing.

5. Return ONLY the JSON object. No prose, no explanation, no markdown.`;

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('usage: bun run extract <path-to-invoice.{pdf,png,jpg,jpeg,webp}>');
    process.exit(2);
  }
  const apiKey = process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPEN_ROUTER_API_KEY env var is required (set it in .env)');
    process.exit(2);
  }

  const client = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    defaultHeaders: {
      // Optional but recommended by OpenRouter for analytics + rate-limit perks.
      'HTTP-Referer': 'https://decimal.finance',
      'X-Title': 'Decimal Doc-to-Proposal Spike',
    },
  });

  const originalExt = extname(filePath).toLowerCase();
  log('input', `${basename(filePath)} (${originalExt})`);
  log('model', MODEL);

  // OpenRouter's free pdf-text plugin is unreliable and most free vision
  // models can't ingest PDFs directly. Convert PDF → PNG locally via
  // macOS `sips` (zero deps, ships with the OS) and feed the rendered
  // image instead.
  const { effectivePath, cleanup } = await maybeConvertPdfToPng(filePath, originalExt);
  const ext = extname(effectivePath).toLowerCase();
  const fileBytes = readFileSync(effectivePath);
  const base64 = fileBytes.toString('base64');
  if (effectivePath !== filePath) {
    log('rendered', `${basename(effectivePath)} (${ext}, ${fileBytes.length} bytes)`);
  }

  const userContent = buildUserContent(ext, base64, basename(effectivePath));

  const t0 = Date.now();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });
  const elapsed = Date.now() - t0;
  cleanup();

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    console.error('no content in response:', JSON.stringify(response, null, 2));
    process.exit(1);
  }
  const raw = choice.message.content;
  const jsonText = extractJsonObject(raw);

  let rawArgs: unknown;
  try {
    rawArgs = JSON.parse(jsonText);
  } catch (err) {
    console.error('response is not valid JSON. raw content:\n' + raw);
    process.exit(1);
  }

  const parsed = RowsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    console.error('schema validation failed:', parsed.error.format());
    console.error('raw input:', JSON.stringify(rawArgs, null, 2));
    process.exit(1);
  }

  log('elapsed', `${elapsed}ms`);
  log('rows', `${parsed.data.rows.length}`);
  if (response.usage) {
    log('tokens.in', String(response.usage.prompt_tokens));
    log('tokens.out', String(response.usage.completion_tokens));
  }
  console.log();
  console.log(JSON.stringify(parsed.data.rows, null, 2));
}

/** Pull the first {...} JSON object out of a possibly-fenced response. */
function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if present.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenceMatch) return fenceMatch[1]!.trim();
  // Otherwise grab from the first { to the last }.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

async function maybeConvertPdfToPng(
  inputPath: string,
  ext: string,
): Promise<{ effectivePath: string; cleanup: () => void }> {
  if (ext !== '.pdf') {
    return { effectivePath: inputPath, cleanup: () => {} };
  }
  if (process.platform !== 'darwin') {
    console.error('PDF input requires macOS sips (or convert your PDF to PNG manually).');
    process.exit(2);
  }
  const dir = mkdtempSync(join(tmpdir(), 'doc2prop-'));
  const out = join(dir, `${basename(inputPath, ext)}.png`);
  try {
    execFileSync('sips', ['-s', 'format', 'png', inputPath, '--out', out], { stdio: 'ignore' });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    console.error('sips failed to render PDF to PNG:', err);
    process.exit(1);
  }
  return {
    effectivePath: out,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function buildUserContent(
  ext: string,
  base64: string,
  filename: string,
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const promptText =
    'Extract every payment in this document. Use the submit_payment_rows tool exactly once.';

  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : null;
  if (!mime) {
    console.error(`unsupported file type: ${ext}. supported: .pdf .png .jpg .jpeg .webp .gif`);
    process.exit(2);
  }
  return [
    { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
    { type: 'text', text: promptText },
  ];
}

function log(key: string, value: string) {
  console.error(`[${key.padEnd(12)}] ${value}`);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
