# PRD-00 — Shared Contracts (Zod / TS)

| | |
|---|---|
| **ID** | `00-contracts` |
| **Epic** | — (cross-cutting prerequisite) |
| **Status** | `todo` |
| **SPEC §12 window** | precedes all (fold the first ~15 min into A1) |
| **Est. effort** | 30–45 min |
| **Cuttable?** | no — every other PRD imports from here |

---

## Context
The highest-leverage move for *aligned* development: freeze the shapes that cross module boundaries
**once**, so streams built hours apart don't drift. Per `SPEC §2`, Zod is the single schema language
for tool args, OCR output, and CSV rows. This PRD makes Zod schemas the source of truth and derives
TS types from them (`z.infer`), so a contract change is a one-place edit the type-checker propagates.
Without this, A2 and B1 would each invent a transaction shape and C1 would invent its own receipt
shape — and the integration seams would rot.

## Scope — In
- `/types/contracts.ts` (or `/lib/contracts/*` re-exported via `/types`) — Zod schemas + inferred
  types for every cross-module shape:
  - `NormalizedTransaction` — the validated row A2 produces / inserts (mirrors `transactions`
    columns in `schema.sql`: `txn_date`, `amount_cents`, `currency`, `merchant_raw`, `merchant_norm`,
    `category`, `description`, `source`, `content_hash`, `metadata`).
  - `IngestSummary` — `{ imported: number, skipped: number, reasons: { reason: string, count: number }[] }`.
  - `ReceiptExtraction` — `{ merchant, date, total_cents, currency, lineItems: {desc, amount_cents}[], confidence }`.
  - `UserMemoryRule` — **discriminated union** on `type`: `exclude_category_from_budget`
    (`{exclude: string, from: string}`), `income_day` (`{day: number}`), `free_text` (`{}` + `text`).
  - Tool I/O schemas — one input + one output schema per tool in the `SPEC §5.1` table
    (`getSpending`, `getTransactions`, `getTrend`, `getSubscriptions`, `getAnomalies`,
    `getBudgetStatus`, `setBudget`, `saveMemory`, `lookupMerchant`, `summarizeFinances`,
    `suggestCutbacks`, `askClarification`).
  - `ResultCardData` — discriminated union on `kind` mapping each tool output to its
    `UI_SPEC §4.3` card (`SpendingBreakdown`, `Trend`, `BudgetStatus`, `ReceiptDraft`, …).
  - Chat contract — request body (`{ conversationId?, messages }`) + the message persistence shape
    (mirrors `messages`: `role`, `content`, `tool_calls`).
- Shared coercion helpers used by A2 and C1 (defined once here):
  - `coerceAmountToCents(raw: string|number): number` — handles `$`, commas, parens-as-negative, decimals.
  - `coerceDate(raw: string): string` — accepts the common CSV formats, emits ISO `YYYY-MM-DD`.
  - `normalizeMerchant(raw: string): string` — trim/upper/collapse-whitespace for grouping.

## Scope — Explicitly Out
- ❌ Any DB access, query, or handler logic → that's the consuming PRDs (A2, B1, …).
- ❌ Re-declaring `schema.sql` as migrations → the schema is already complete; this PRD *mirrors* its
  column types in Zod, it does not own the DB.
- ❌ Provider/model resolution → `B1` (`models.ts`).
- ❌ React prop types beyond `ResultCardData` → `B2` owns component-internal types.

## Dependencies
- `schema.sql` (exists) — the authoritative column types these schemas mirror.
- None on other PRDs (this is the root of the graph).

## Interfaces & Contracts
This PRD **is** the interface layer. Representative shapes (final names live in the file):
```ts
export const NormalizedTransaction = z.object({
  txn_date: z.string(),                 // ISO YYYY-MM-DD (via coerceDate)
  amount_cents: z.number().int(),       // negative = spend, positive = income
  currency: z.string().default("USD"),
  merchant_raw: z.string().nullable(),
  merchant_norm: z.string().nullable(),
  category: z.string().default("uncategorized"),
  description: z.string().nullable(),
  source: z.enum(["csv", "bank", "receipt", "manual"]),
  content_hash: z.string(),
  metadata: z.record(z.unknown()).default({}),
});
export type NormalizedTransaction = z.infer<typeof NormalizedTransaction>;

export const IngestSummary = z.object({
  imported: z.number().int(),
  skipped: z.number().int(),
  reasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
});

export const UserMemoryRule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("exclude_category_from_budget"), exclude: z.string(), from: z.string() }),
  z.object({ type: z.literal("income_day"), day: z.number().int().min(1).max(31) }),
  z.object({ type: z.literal("free_text"), text: z.string() }),
]);

export const ReceiptExtraction = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),           // ISO; may be null when illegible
  total_cents: z.number().int().nullable(),
  currency: z.string().default("USD"),
  lineItems: z.array(z.object({ desc: z.string(), amount_cents: z.number().int() })).default([]),
  confidence: z.number().min(0).max(1),
});
```
**Rule:** any new shape used by ≥2 PRDs is added here first, then imported — never re-declared locally.

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Amount like `"$1,234.50"`, `"(45.00)"`, `"45"` | `coerceAmountToCents` → `123450`, `-4500`, `4500` | `§9 messy CSV` |
| Date in `MM/DD/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD` | `coerceDate` → ISO, ambiguous → record assumption | `§9 messy CSV` |
| Missing currency | default `'USD'` (single-currency assumption, `§13`) | `§13` |
| Receipt field illegible | shape allows `null`; downstream confidence gate decides | `§9 receipt` |

## Reuse
- `schema.sql` lines 48–67 (`transactions`), 139–148 (`user_memory`), 176–186 (`receipts`) — column
  types to mirror.
- `SPEC §5.1` — the tool table → one Zod input/output pair each.
- `UI_SPEC §4.3` — card list → `ResultCardData` union variants.
- `zod` (`SPEC §2`).

## Acceptance criteria
- [ ] `pnpm typecheck` passes with every consuming PRD importing only from this module for shared shapes.
- [ ] Every `SPEC §5.1` tool has an input and output Zod schema exported here.
- [ ] Coercion helpers have unit tests (shared with A2's test set, `§13` allows minimal tests).

## Verification
1. `pnpm typecheck` — no `any` at module boundaries; types derive via `z.infer`.
2. Unit test `coerceAmountToCents` / `coerceDate` against the edge-case table above.
3. Grep check: no second declaration of a shape named here exists elsewhere (`§ contract check`).

## Commit / PR boundary
- `feat(contracts): shared Zod schemas + inferred types for tools, ingest, receipts, memory`

## Assumptions / Open questions
- Single base currency per user; FX out of scope (`SPEC §13`) — `currency` is stored, not converted.
- Tool output schemas double as the `ResultCardData` payloads to avoid a second mapping layer; if a
  card needs a presentation-only field, it's added to the output schema here, not in the component.
