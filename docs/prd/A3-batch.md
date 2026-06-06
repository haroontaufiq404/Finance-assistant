# PRD-A3 — Batch / Precompute Jobs

| | |
|---|---|
| **ID** | `A3` |
| **Epic** | A — Data plane (write path) |
| **Status** | `todo` |
| **SPEC §12 window** | 1:30–2:30 |
| **Est. effort** | 60 min |
| **Cuttable?** | partial — anomalies is **cut #2**; rollups + subscriptions stay |

---

## Context
This is the precompute that makes the read path cheap and scalable — the core of the thesis
(`SPEC §1`, §7). Heavy analytics run **once at ingest**, not per request. Rollups are the answer to
"compare across time" and "data 10×–100× larger": their size scales with *time periods*, not row
count. All jobs are idempotent and scoped to one user, so re-running on re-ingest is safe.

## Scope — In
- `/lib/batch/categorize.ts` — **rules first**: merchant→category map + keyword rules. Only rows
  still `uncategorized` fall through to a **single batched** cheap-model call (`ROUTER_MODEL`). Never
  one model call per row.
- `/lib/batch/rollups.ts` — recompute `rollups` for affected months: per `(month, category)` plus a
  `__all__` row. `INSERT … ON CONFLICT (user_id, period_type, period_start, category) DO UPDATE`
  (the pattern is spelled out in `schema.sql` lines 289–291).
- `/lib/batch/subscriptions.ts` — group by `merchant_norm`; cluster gaps near 7/30/365 days with
  stable amounts; upsert `subscriptions` with `cadence_days`, `avg_amount_cents`, `next_expected`,
  `confidence`. Idempotent via `unique(user_id, merchant_norm)`.
- `/lib/batch/anomalies.ts` — per category rolling mean/stddev → flag z-score > threshold
  (`amount_spike`), first-time merchants (`new_merchant`), month-over-month category jumps
  (`category_spike`). Insert into `anomalies`. **Z-score only** — name the ML upgrade path in README.
- `runBatchForUser(userId, affectedMonths?)` — the single entrypoint A2 calls; orchestrates the four
  jobs idempotently.

## Scope — Explicitly Out
- ❌ ML / seasonal anomaly models, embeddings → out (`SPEC §7/§13`); ship z-score, name the upgrade.
- ❌ Reading these tables / exposing tools → `B1` (this PRD only *writes* them).
- ❌ Per-row model categorization → forbidden; batch the fallthrough in one call.
- ❌ Async/queue execution → out (`SPEC §13`); synchronous, invoked by A2.
- ❌ Budget evaluation → `B3` (budgets are read-time, not precomputed).

## Dependencies
- `00-contracts` — result shapes (rollup/subscription/anomaly rows align with `schema.sql`).
- `A1` — `getServerClient()` for writes.
- `A2` — calls `runBatchForUser`; supplies affected months.
- `B1`'s `models.ts` is **not** required at A3 build time — categorize's model fallthrough can use a
  thin direct provider call or be stubbed to leave rows `uncategorized` until models.ts lands.

## Interfaces & Contracts
```ts
// /lib/batch/index.ts (or pipeline)
export async function runBatchForUser(
  userId: string,
  opts?: { affectedMonths?: string[] }   // ISO 'YYYY-MM-01'; omit = recompute all
): Promise<{ rollups: number; subscriptions: number; anomalies: number; categorized: number }>;
```
Each job is independently callable and idempotent so partial re-runs are safe.

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Re-ingest / re-run | upserts overwrite, no duplicate rows (idempotent) | `SPEC §7` |
| Sparse history (1 month) | subscriptions need ≥2–3 occurrences → emit none rather than false positives | `SPEC §7` |
| Anomaly stddev = 0 (constant amounts) | guard divide-by-zero; no spurious z-score flag | robustness |
| Many uncategorized rows | one batched model call, capped; leftover stays `uncategorized` | `SPEC §7` cost |
| Long history (years) | rollups keyed by month → cost scales with periods, not rows | `SPEC §1`, `§15` |

## Reuse
- `schema.sql`: `rollups` (74–84), `subscriptions` (89–101), `anomalies` (106–118), and the upsert
  recipe in the implementer notes (289–291).
- `categories` seed table (273–280) — the rules-first category vocabulary.
- Postgres `date_trunc` / window functions (`SPEC §2`) — do rollups in SQL, not in JS.
- `ROUTER_MODEL` via `B1` `models.ts` (or a stub) for the categorize fallthrough only.

## Acceptance criteria
- [ ] After ingest, `rollups` has per-month `__all__` + per-category rows with correct sums. (`§15`)
- [ ] At least one of subscriptions / anomalies / budgets works end-to-end (budgets via B3). (`§15`)
- [ ] Subscriptions detected for genuinely recurring merchants with a confidence + `next_expected`.
- [ ] Re-running batch produces identical tables (idempotent).
- [ ] Categorization makes ≤1 model call per ingest batch (verify no per-row calls).

## Verification
1. Ingest sample CSV (A2) → Supabase MCP: query `rollups` for a known month; hand-check the total
   against a SQL `SUM` over `transactions`.
2. Query `subscriptions` → confirm a known recurring merchant appears with sane cadence.
3. Query `anomalies` → confirm an obvious outlier is flagged with a human-readable reason.
4. Re-run `runBatchForUser` → row counts unchanged.

## Commit / PR boundary
- `feat(batch): monthly rollups upsert (__all__ + per-category)`
- `feat(batch): recurring-charge detection (subscriptions)`
- `feat(batch): z-score anomaly scoring`
- `feat(batch): rules-first categorize with batched cheap-model fallthrough`

## Assumptions / Open questions
- Z-score threshold (e.g. >3) and minimum occurrences for a subscription (≥3) — record chosen values
  in README.
- Rollups ship `month` only; `week`/`day` allowed by schema but not surfaced (`SPEC §13`).
