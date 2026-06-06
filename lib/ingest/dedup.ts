import { createHash } from "node:crypto";
import type { NormalizedTransaction } from "@/lib/contracts";

/**
 * Content hash used as the idempotency key (PRD-A2). Combined with the
 * `unique(user_id, content_hash)` constraint (schema.sql), re-uploading the
 * same CSV is a no-op. Hash is stable across runs for identical input.
 */
export function contentHash(userId: string, txn: NormalizedTransaction): string {
  const key = [
    userId,
    txn.txn_date,
    txn.amount_cents,
    txn.merchant_norm ?? "",
    txn.description ?? "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Drop in-file duplicates before insert so import counts are accurate and a
 * single INSERT can't collide with itself. Returns rows tagged with their hash.
 */
export function dedupeInBatch(
  userId: string,
  txns: NormalizedTransaction[],
): { rows: (NormalizedTransaction & { content_hash: string })[]; inFileDuplicates: number } {
  const seen = new Set<string>();
  const rows: (NormalizedTransaction & { content_hash: string })[] = [];
  let inFileDuplicates = 0;

  for (const txn of txns) {
    const hash = contentHash(userId, txn);
    if (seen.has(hash)) {
      inFileDuplicates++;
      continue;
    }
    seen.add(hash);
    rows.push({ ...txn, content_hash: hash });
  }

  return { rows, inFileDuplicates };
}
