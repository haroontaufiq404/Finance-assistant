import { z } from "zod";

/** Source of a transaction row (mirrors transactions.source check in schema.sql). */
export const TransactionSource = z.enum(["csv", "bank", "receipt", "manual"]);
export type TransactionSource = z.infer<typeof TransactionSource>;

/**
 * A cleaned, validated transaction ready to insert. Produced by the ingest
 * pipeline (A2) and the receipt confirm flow (C1). `amount_cents` is signed:
 * negative = spend, positive = income (schema.sql). `user_id`, `content_hash`,
 * `id`, and `created_at` are attached by the pipeline / DB, not by validation.
 */
export const NormalizedTransaction = z.object({
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be ISO YYYY-MM-DD"),
  amount_cents: z.number().int(),
  currency: z.string().min(1).default("USD"),
  merchant_raw: z.string().nullable(),
  merchant_norm: z.string().nullable(),
  category: z.string().min(1).default("uncategorized"),
  description: z.string().nullable(),
  source: TransactionSource,
  metadata: z.record(z.unknown()).default({}),
});
export type NormalizedTransaction = z.infer<typeof NormalizedTransaction>;

/** A persisted transaction row as read back from the DB. */
export const TransactionRow = NormalizedTransaction.extend({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  content_hash: z.string(),
  created_at: z.string(),
});
export type TransactionRow = z.infer<typeof TransactionRow>;
