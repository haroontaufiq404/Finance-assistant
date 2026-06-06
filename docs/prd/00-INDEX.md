# PRD Index — Personal Finance Assistant

This folder decomposes `SPEC.md` (the decision-locked system spec) into **modular, independently
buildable PRDs**. It is the work-decomposition layer between the spec and the code. The spec says
*what the system is*; these PRDs say *where one unit of work ends, what it may not touch, and how to
prove it works*.

**How to use:** pick a PRD whose dependencies are all `done`, build only what's in its "Scope — In",
respect "Scope — Explicitly Out", verify against its checklist, commit at its PR boundary. Don't
re-read the whole spec — each PRD carries the context it needs via its Dependencies + Reuse pointers.

Source docs: [`SPEC.md`](../SPEC.md) · [`UI_SPEC.md`](../UI_SPEC.md) ·
[`README.md`](../README.md) (design note) · [`schema.sql`](../schema.sql) (already complete).

---

## Epics → sub-PRDs (status board)

| PRD | Title | Epic | SPEC §12 | Status | Cuttable |
|---|---|---|---|---|---|
| [`00-contracts`](./00-contracts.md) | Shared Zod/TS contracts | — (cross-cutting) | precedes all | `todo` | no |
| [`A1-foundation`](./A1-foundation.md) | Scaffold · auth · db client · schema apply | A Data plane | 0:00–0:30 | `todo` | no |
| [`A2-ingest`](./A2-ingest.md) | CSV parse/validate/dedup/quarantine | A Data plane | 0:30–1:30 | `todo` | no |
| [`A3-batch`](./A3-batch.md) | Categorize · rollups · subscriptions · anomalies | A Data plane | 1:30–2:30 | partial (anomalies = cut #2) |
| [`B1-agent-core`](./B1-agent-core.md) | Models · tools · orchestrator · `/api/chat` | B Agent plane | 2:30–4:00 | no |
| [`B2-chat-ui`](./B2-chat-ui.md) | Chat shell · streaming · result cards | B Agent plane | 2:30–4:00 | partial (polish cards) |
| [`B3-memory-budgets`](./B3-memory-budgets.md) | `user_memory` rules + budget tools | B Agent plane | 2:30–4:00 | no (memory rule is graded) |
| [`C1-receipts`](./C1-receipts.md) | Vision OCR · confidence gate · confirm | C Multimodal | 4:00–5:00 | yes — cut #3 |
| [`C2-merchant-lookup`](./C2-merchant-lookup.md) | Agentic web lookup tool | C Multimodal | 5:00–5:30 | yes — cut #1 |
| [`D1-readme`](./D1-readme.md) | Design note (§14) | D Delivery | 5:30–6:00 | no |
| [`D2-deploy`](./D2-deploy.md) | Vercel deploy + smoke test | D Delivery | 5:30–6:00 | no |

---

## Dependency graph

```
00-contracts ──┬─────────────────────────────────────────────────────────────┐
               ▼                                                               │
   A1-foundation ──► A2-ingest ──► A3-batch ──► B1-agent-core ──┬──► B2-chat-ui │
                                                                ├──► B3-memory  │
                                                                ├──► C1-receipts│
                                                                └──► C2-merchant│
   everything ───────────────────────────────────────────────────► D1-readme ──► D2-deploy
```

- **Strict chain:** `00-contracts → A1 → A2 → A3 → B1`. Nothing answers a question until data is
  ingested (A2) and precomputed (A3), and B1 reads those tables.
- **Fan-out from B1:** B2 (UI) consumes B1's stream contract; B3 layers rule application onto B1's
  reads; C1/C2 plug new tools into B1's tool boundary.
- **D1/D2 last:** depend on whatever shipped; D1 must honestly reflect built-vs-stubbed.
- It is a DAG — every "Dependencies" entry points only at PRDs left of it here.

### Parallelization note
After B1 lands, **B2, B3, C1, C2 are independent** and can be built in any order / by different
builders, because they all bind to frozen contracts from `00-contracts.md` and B1's tool boundary.
That independence is the whole point of freezing contracts first.

---

## Build order & cut policy (`SPEC §12`)

Build top-to-bottom in the status board. If running behind, **cut in this order** (per `SPEC §12`):

1. **Cut #1 — C2 merchant-lookup** (agentic web). Highest effort-to-DoD ratio.
2. **Cut #2 — anomalies** (inside A3). Keep rollups + subscriptions.
3. **Cut #3 — C1 receipts**. Multimodal is high-signal but expensive in time.

**Never cut** (per `SPEC §12` + `UI_SPEC §8`): ingest cleaning/quarantine (A2), RLS isolation (A1),
the routing/tool layer (B1), the memory-rule + budget-exclusion proof (B3), the import-summary +
receipt-confirm + budget-exclusion UI notes (B2/`UI_SPEC §8`), and the README (D1).

---

## Coverage matrix A — Definition of Done (`SPEC §15`)

Every acceptance line maps to exactly **one owning PRD** (no gap, no double-owner).

| `SPEC §15` acceptance line | Owner |
|---|---|
| New user signs up, lands in empty state, RLS-isolated (B can't read A) | A1 (+ B2 empty state) |
| CSV upload reports `{imported, skipped, reasons}`, idempotent on re-upload | A2 |
| "Groceries last month" → correct number via `getSpending`, <~2s, no raw rows in context | B1 |
| "Spending more than usual this month?" → answered via `getTrend`/rollups | A3 (data) + B1 (tool) |
| At least one of: subscriptions / anomalies / budget works end-to-end | A3 + B3 |
| Receipt photo → extracted draft; low confidence → confirm step; confirm → linked txn | C1 |
| Unknown merchant → `lookupMerchant` sourced guess or honest "couldn't determine" | C2 |
| "Don't count rent in food budget" persists a rule that visibly changes `getBudgetStatus` | B3 |
| README covers `§14` | D1 |
| App deployed, repo has incremental commits | D2 (+ every PRD's commit boundary) |

---

## Coverage matrix B — Edge cases (`SPEC §9`)

| `SPEC §9` situation | Owner |
|---|---|
| Blurry / rotated / foreign receipt → confidence gate → confirm; manual fallback | C1 |
| Messy CSV (dupes, missing fields, junk) → validate + quarantine; idempotent dedup; summary | A2 |
| Ambiguous question → `askClarification`, ask one focused question | B1 |
| Unanswerable from data → say so plainly, offer closest supported; never fabricate | B1 |
| Contradicting sources (receipt vs bank txn) → match on date+amount+merchant, surface conflict | C1 |
| Slow/expensive-if-naive request → routing + rollups; long ranges hit `getTrend` not raw rows | A3 + B1 |
| New requirement mid-eval → one new tool + one routing line | B1 (tool boundary) |

---

## Coverage matrix C — Repo structure (`SPEC §3`) ownership

Every file/dir in `SPEC §3` is claimed by exactly one PRD's "Scope — In".

| Path | Owner |
|---|---|
| `/app/(auth)/login`, `/lib/db/client.ts`, scaffold/config, `.env.example` | A1 |
| `/lib/ingest/*`, `/api/ingest/route.ts` | A2 |
| `/lib/batch/*` | A3 |
| `/lib/agent/*`, `/lib/db/queries.ts`, `/api/chat/route.ts` | B1 |
| `/app/chat/page.tsx`, `/components/*` | B2 |
| `/lib/memory/rules.ts`, budget tools/queries | B3 |
| `/api/receipts/route.ts`, `/api/receipts/confirm/route.ts` | C1 |
| `/lib/search/web.ts`, `lookupMerchant` tool | C2 |
| `/types/*` (shared shapes) | 00-contracts |
| `README.md` | D1 |
| `/db/schema.sql` | already complete (no PRD modifies it) |
