import { escapeClickHouseString, normalizeClickHouseDateTime, queryClickHouse } from './clickhouse.js';
import { config } from './config.js';
import { prisma } from './prisma.js';

type ObservedTransferRow = {
  transfer_id: string;
  signature: string;
  slot: string | number;
  event_time: string;
  asset: string;
  source_token_account: string | null;
  source_wallet: string | null;
  destination_token_account: string;
  destination_wallet: string | null;
  amount_raw: string;
  amount_decimal: string;
  transfer_kind: string;
  instruction_index: number | string | null;
  inner_instruction_index: number | string | null;
  route_group: string;
  leg_role: string;
  properties_json: string | null;
  created_at: string;
  chain_to_write_ms: string | number;
};

export async function listObservedTransfersForWorkspace(workspaceId: string, options: { limit: number }) {
  const addresses = await prisma.workspaceAddress.findMany({
    where: { workspaceId, isActive: true },
    select: {
      address: true,
      usdcAtaAddress: true,
    },
  });

  const walletAddresses = uniqueValues(addresses.map((item) => item.address));
  const ataAddresses = uniqueValues(
    addresses.map((item) => item.usdcAtaAddress).filter((value): value is string => Boolean(value)),
  );

  if (!walletAddresses.length && !ataAddresses.length) {
    return [];
  }

  const clauses: string[] = [];

  if (walletAddresses.length) {
    const wallets = walletAddresses.map((value) => `'${escapeClickHouseString(value)}'`).join(', ');
    clauses.push(`source_wallet IN (${wallets})`);
    clauses.push(`destination_wallet IN (${wallets})`);
  }

  if (ataAddresses.length) {
    const atas = ataAddresses.map((value) => `'${escapeClickHouseString(value)}'`).join(', ');
    clauses.push(`source_token_account IN (${atas})`);
    clauses.push(`destination_token_account IN (${atas})`);
  }

  const rows = await queryClickHouse<ObservedTransferRow>(`
    SELECT
      transfer_id,
      signature,
      slot,
      event_time,
      asset,
      source_token_account,
      source_wallet,
      destination_token_account,
      destination_wallet,
      amount_raw,
      amount_decimal,
      transfer_kind,
      instruction_index,
      inner_instruction_index,
      route_group,
      leg_role,
      properties_json,
      created_at,
      dateDiff('millisecond', event_time, created_at) AS chain_to_write_ms
    FROM ${config.clickhouseDatabase}.observed_transfers
    WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')}
    ORDER BY event_time DESC
    LIMIT ${options.limit}
    FORMAT JSONEachRow
  `);

  return rows.map((row) => ({
    transferId: row.transfer_id,
    signature: row.signature,
    slot: Number(row.slot),
    eventTime: normalizeClickHouseDateTime(row.event_time),
    asset: row.asset,
    sourceTokenAccount: row.source_token_account,
    sourceWallet: row.source_wallet,
    destinationTokenAccount: row.destination_token_account,
    destinationWallet: row.destination_wallet,
    amountRaw: row.amount_raw,
    amountDecimal: row.amount_decimal,
    transferKind: row.transfer_kind,
    instructionIndex:
      row.instruction_index === null ? null : Number(row.instruction_index),
    innerInstructionIndex:
      row.inner_instruction_index === null ? null : Number(row.inner_instruction_index),
    routeGroup: row.route_group,
    legRole: row.leg_role,
    propertiesJson: safeJsonParse(row.properties_json),
    createdAt: normalizeClickHouseDateTime(row.created_at),
    chainToWriteMs: Number(row.chain_to_write_ms),
  }));
}

function safeJsonParse(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}
