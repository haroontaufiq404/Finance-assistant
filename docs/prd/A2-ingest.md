# PRD-A2 — Ingest Pipeline (CSV → clean → dedup → quarantine)

| | |
|---|---|
| **ID** | `A2` |
| **Epic** | A — Data plane (write path entry) |
| **Status** | `todo` |
| **SPEC §12 window** | 0:30–1:30 |
| **Est. effort** | 60 min |
| **Cuttable?** | no — the cleaning is graded heavily (`SPEC §9`, §12) |

---

## Context
Nothing in the product works without data, and **how messy data is handled is explicitly graded**
(`SPEC §6`, §9). This PRD turns an uploaded CSV (or the mock-bank pull, same path) into validated,
deduplicated `transactions` rows — **quarantining bad rows, never silently dropping them** — and
returns an honest `{imported, skipped, reasons}` summary. It also triggers the batch precompute (A3)
at the end, synchronously for the demo (`SPEC §6`).

## Scope — In
- `/lib/ingest/parse.ts` — papaparse wrapper (tolerant: odd delimiters/quoting, header detection) +
  per-row normalize/validate against `NormalizedTransaction` (from `00-contracts`), using the shared
  `coerceAmountToCents` / `coerceDate` / `normalizeMerchant` helpers.
- `/lib/ingest/dedup.ts` — `content_hash = sha256(user_id|txn_date|amount_cents|merchant_norm|description)`.
- `/lib/ingest/pipeline.ts` — orchestrates parse → validate → dedup → insert → invoke A3 batch;
  returns `IngestSummary`. Insert relies on `unique(user_id, content_hash)` for idempotency.
- `/api/ingest/route.ts` — `POST` multipart CSV; auth via `getCurrentUser()`; returns `IngestSummary`.
- A small sample CSV fixture under `/fixtures` (or use the assessment's) for tests + manual demo.
- Unit tests on cleaning + dedup (`SPEC §13` calls a few tests "enough to signal").

## Scope — Explicitly Out
- ❌ Computing rollups/subscriptions/anomalies → `A3` (this PRD only *invokes* it).
- ❌ Categorization logic → `A3` (`categorize.ts`); ingest defaults missing category to
  `uncategorized` per the schema, nothing smarter.
- ❌ Async job queue → out (`SPEC §13`); batch runs synchronously here. Note the production path.
- ❌ Real bank API → out (`SPEC §13`); the mock/CSV is the only source.
- ❌ Defining the `NormalizedTransaction`/`IngestSummary` shapes → `00-contracts`.

## Dependencies
- `00-contracts` — `NormalizedTransaction`, `IngestSummary`, coercion helpers.
- `A1` — `getCurrentUser()`, `getServerClient()` (RLS-bound insert).
- `A3` — `runBatchForUser(userId, affectedMonths)` to call at the end (build A2 to invoke a stub if
  A3 isn't done yet; the seam is one function call).

## Interfaces & Contracts
```ts
// /lib/ingest/pipeline.ts
export async function ingestCsv(args: {
  userId: string;
  file: File | string;      // raw CSV
  source?: "csv" | "bank";  // default 'csv'
}): Promise<IngestSummary>;

// /api/ingest/route.ts  POST (multipart/form-data: file)
//   200 -> IngestSummary   401 -> unauthenticated   400 -> not a CSV
```
The route returns `IngestSummary` verbatim — `B2`'s import-summary card binds to this shape.

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Duplicate rows / re-upload same file | dedup via `content_hash`; re-upload is a no-op (idempotent) | `§9 messy CSV`, `§15` |
| Missing required field (date/amount) | row → `ingest_errors` with reason; counted in `skipped` | `§9` |
| Junk / non-data rows, odd delimiters/quotes | papaparse tolerance; unparseable → quarantine, not crash | `§9` |
| Ambiguous date format | coerce best-effort; if undecidable, quarantine with reason | `§9` |
| Amount with `$`, commas, parens | `coerceAmountToCents` (defined in `00-contracts`) | `§9` |
| Partial-batch DB error | report what imported; don't claim success for failed rows | `§15` honesty |

## Reuse
- `schema.sql` `transactions` table + `transactions_uniq` constraint (lines 48–64) — idempotency is
  enforced by the DB, not app code.
- `schema.sql` `ingest_errors` table (lines 192–198) — the quarantine target.
- `00-contracts` coercion helpers (single source of truth).
- `papaparse` (`SPEC §2`).

## Acceptance criteria
- [ ] Uploading the sample CSV returns `{imported, skipped, reasons[]}`. (`§15`)
- [ ] Re-uploading the same CSV imports 0 new rows (idempotent). (`§15`)
- [ ] A row with a missing/!parseable field lands in `ingest_errors` with a reason, not dropped. (`§9`)
- [ ] Unit tests cover: cents coercion, date coercion, dedup hash stability, quarantine path. (`§13`)
- [ ] Batch (A3) is invoked once per ingest for the affected user/months.

## Verification
1. Unit: `pnpm test lib/ingest` — feed a fixture with dupes + a junk row; assert summary counts +
   `ingest_errors` contents.
2. Manual: `pnpm dev` → upload sample CSV from empty state → import summary shows added/skipped +
   expandable reasons (`UI_SPEC §4.5`). Re-upload → 0 added.
3. Supabase MCP: confirm `transactions` row count and `ingest_errors` rows after import.

## Commit / PR boundary
- `feat(ingest): papaparse + per-row zod normalize/validate`
- `feat(ingest): content-hash dedup + ingest_errors quarantine`
- `feat(api): /api/ingest returns import summary; triggers batch`
- `test(ingest): cleaning + dedup unit tests`

## Assumptions / Open questions
- Synchronous batch at end of ingest is acceptable for the demo (`SPEC §6/§13`); production → queue.
- CSV column mapping: detect common headers (date/amount/description/merchant); record the assumed
  mapping in README if the sample's headers are nonstandard.
