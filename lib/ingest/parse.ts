import Papa from "papaparse";
import {
  NormalizedTransaction,
  type TransactionSource,
  type RawCsvRow,
  coerceAmountToCents,
  coerceDate,
  normalizeMerchant,
} from "@/lib/contracts";

/**
 * CSV parsing + per-row normalization (PRD-A2). Tolerant of odd delimiters and
 * quoting (papaparse) and flexible about headers (banks all differ). Rows that
 * fail validation are returned as errors for quarantine — never dropped (SPEC §9).
 */

export type ParsedRow =
  | { ok: true; txn: NormalizedTransaction }
  | { ok: false; raw: RawCsvRow; reason: string };

export interface ParseResult {
  valid: NormalizedTransaction[];
  errors: { raw: RawCsvRow; reason: string }[];
  totalRows: number;
}

// Header synonyms, matched case-insensitively after trimming.
const FIELD_SYNONYMS = {
  date: ["date", "txn_date", "transaction date", "posted", "posted date", "post date"],
  amount: ["amount", "amt", "value"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "paid out"],
  credit: ["credit", "deposit", "deposits", "money in", "paid in"],
  description: ["description", "memo", "narrative", "details", "notes", "reference"],
  merchant: ["merchant", "payee", "vendor", "name", "to"],
  category: ["category", "cat"],
  currency: ["currency", "ccy"],
} as const;

type Field = keyof typeof FIELD_SYNONYMS;
type ColumnMap = Partial<Record<Field, string>>;

function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const lower = headers.map((h) => ({ original: h, norm: h.trim().toLowerCase() }));
  for (const field of Object.keys(FIELD_SYNONYMS) as Field[]) {
    const synonyms = FIELD_SYNONYMS[field];
    const hit = lower.find((h) => synonyms.includes(h.norm as never));
    if (hit) map[field] = hit.original;
  }
  return map;
}

function pick(row: RawCsvRow, col: string | undefined): string | null {
  if (!col) return null;
  const v = row[col];
  return v == null || v.trim() === "" ? null : v.trim();
}

/** Normalize one raw CSV row into a validated transaction, or an error reason. */
export function normalizeRow(
  row: RawCsvRow,
  cols: ColumnMap,
  source: TransactionSource,
): ParsedRow {
  const txn_date = coerceDate(pick(row, cols.date));
  if (!txn_date) {
    return { ok: false, raw: row, reason: "missing or unparseable date" };
  }

  // Amount: a single signed column, or separate debit/credit columns.
  let amount_cents: number | null = null;
  if (cols.amount) {
    amount_cents = coerceAmountToCents(pick(row, cols.amount));
  } else if (cols.debit || cols.credit) {
    const debit = coerceAmountToCents(pick(row, cols.debit));
    const credit = coerceAmountToCents(pick(row, cols.credit));
    if (debit != null || credit != null) {
      amount_cents = (credit ?? 0) - Math.abs(debit ?? 0);
    }
  }
  if (amount_cents == null) {
    return { ok: false, raw: row, reason: "missing or unparseable amount" };
  }

  const merchant_raw = pick(row, cols.merchant) ?? pick(row, cols.description);
  const candidate = {
    txn_date,
    amount_cents,
    currency: pick(row, cols.currency) ?? "USD",
    merchant_raw,
    merchant_norm: normalizeMerchant(merchant_raw),
    category: (pick(row, cols.category) ?? "uncategorized").toLowerCase(),
    description: pick(row, cols.description),
    source,
    metadata: {},
  };

  const parsed = NormalizedTransaction.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, raw: row, reason: parsed.error.issues[0]?.message ?? "invalid row" };
  }
  return { ok: true, txn: parsed.data };
}

/** Parse a full CSV string into validated transactions + quarantined errors. */
export function parseTransactions(
  csv: string,
  source: TransactionSource = "csv",
): ParseResult {
  const result = Papa.parse<RawCsvRow>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  const cols = detectColumns(headers);

  const valid: NormalizedTransaction[] = [];
  const errors: { raw: RawCsvRow; reason: string }[] = [];

  // If we can't find the essential columns, every row will fail; say why once.
  if (!cols.date || (!cols.amount && !cols.debit && !cols.credit)) {
    for (const raw of result.data) {
      errors.push({ raw, reason: "could not detect date/amount columns in header" });
    }
    return { valid, errors, totalRows: result.data.length };
  }

  for (const raw of result.data) {
    const out = normalizeRow(raw, cols, source);
    if (out.ok) valid.push(out.txn);
    else errors.push({ raw: out.raw, reason: out.reason });
  }

  return { valid, errors, totalRows: result.data.length };
}
