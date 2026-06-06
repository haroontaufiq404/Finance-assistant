import "server-only";
import { getServerClient } from "@/lib/db/client";
import { runBatchForUser } from "@/lib/batch";
import { type IngestSummary, type TransactionSource } from "@/lib/contracts";
import { parseTransactions } from "./parse";
import { dedupeInBatch } from "./dedup";

/**
 * Orchestrates the write path (PRD-A2): parse → validate → dedup → insert
 * (idempotent) → quarantine errors → trigger batch precompute. Returns an
 * honest import summary; bad rows are quarantined, never dropped (SPEC §6, §9).
 */
export async function ingestCsv(args: {
  userId: string;
  csv: string;
  source?: TransactionSource;
}): Promise<IngestSummary> {
  const { userId, csv, source = "csv" } = args;
  const supabase = await getServerClient();

  const { valid, errors } = parseTransactions(csv, source);
  const { rows, inFileDuplicates } = dedupeInBatch(userId, valid);

  // Insert idempotently: ON CONFLICT (user_id, content_hash) DO NOTHING.
  // .select() returns only newly-inserted rows, so we can count duplicates.
  let imported = 0;
  const affectedMonths = new Set<string>();
  if (rows.length > 0) {
    const payload = rows.map((r) => ({ ...r, user_id: userId }));
    const { data, error } = await supabase
      .from("transactions")
      .upsert(payload, { onConflict: "user_id,content_hash", ignoreDuplicates: true })
      .select("txn_date");
    if (error) throw new Error(`transaction insert failed: ${error.message}`);
    imported = data?.length ?? 0;
    for (const r of data ?? []) {
      affectedMonths.add(`${(r.txn_date as string).slice(0, 7)}-01`);
    }
  }
  const existingDuplicates = rows.length - imported;

  // Quarantine invalid rows so they are visible, not silently lost.
  if (errors.length > 0) {
    const { error } = await supabase.from("ingest_errors").insert(
      errors.map((e) => ({ user_id: userId, raw_row: e.raw, reason: e.reason })),
    );
    if (error) throw new Error(`quarantine insert failed: ${error.message}`);
  }

  // Recompute aggregates for the affected months (synchronous for the demo).
  if (imported > 0) {
    await runBatchForUser(userId, { affectedMonths: [...affectedMonths] });
  }

  // Aggregate skip reasons for the summary card.
  const reasonCounts = new Map<string, number>();
  for (const e of errors) {
    reasonCounts.set(e.reason, (reasonCounts.get(e.reason) ?? 0) + 1);
  }

  return {
    imported,
    skipped: errors.length,
    duplicates: inFileDuplicates + existingDuplicates,
    reasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
  };
}
