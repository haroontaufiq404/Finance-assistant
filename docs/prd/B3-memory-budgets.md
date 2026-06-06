# PRD-B3 — User Memory + Budgets

| | |
|---|---|
| **ID** | `B3` |
| **Epic** | B — Agent plane |
| **SPEC §12 window** | 2:30–4:00 (with B1) |
| **Status** | `todo` |
| **Est. effort** | 45 min |
| **Cuttable?** | no — the memory-rule proof is explicitly graded (`SPEC §15`) |

---

## Context
Two capabilities that share one mechanism: **deterministic user memory** reconfigures the query layer
(`SPEC §5`, schema notes 135–137, 292–293), and **budgets** are evaluated at read time with those
rules applied. The headline demo — *"don't count rent in my food budget"* persists a rule that
**visibly changes** `getBudgetStatus` (`SPEC §15`, `UI_SPEC §5.4`) — lives here. Rules are applied
deterministically in SQL/handler code, not by asking the model to "remember" in-context.

## Scope — In
- `/lib/memory/rules.ts` — read `user_memory` for a user; produce (a) a **compact summary string**
  injected into the orchestrator system prompt (so facts like "paid on the 1st" apply without a tool
  round-trip, `SPEC §5` loop rule 1), and (b) a structured accessor the budget query uses to apply
  `exclude_category_from_budget` rules.
- Tools (registered into `B1`'s `buildToolSet`):
  - `saveMemory` — insert a `user_memory` row (`UserMemoryRule` from `00-contracts`).
  - `setBudget` — upsert `budgets` (`unique(user_id, category, period_type)`).
  - `getBudgetStatus` — join `budgets` + current-month `rollups`; **apply exclusion rules** before
    comparing spend to `limit_cents`; return limit / spend / % used / remaining / applied-exclusions.
- Budget query functions in `/lib/db/queries.ts` (budget-specific additions).

## Scope — Explicitly Out
- ❌ The orchestrator loop itself / prompt assembly → `B1` (B3 supplies the rule-summary string B1
  injects, and registers its tools into B1's tool set).
- ❌ Defining `UserMemoryRule` shape → `00-contracts`.
- ❌ Budget periods beyond monthly → out (`SPEC §13`; schema constrains `budgets.period_type` to
  `'month'`).
- ❌ `BudgetStatusCard` rendering / exclusion-note UI → `B2` (B3 returns the data incl. exclusions).
- ❌ Free-form NL memory inference → keep rules to the discriminated union in `00-contracts`; arbitrary
  free text is stored as a `free_text` fact, not executed.

## Dependencies
- `00-contracts` — `UserMemoryRule` union + budget tool I/O schemas.
- `A1` — `getServerClient()`.
- `A3` — current-month `rollups` (the spend side of budget status).
- `B1` — `buildToolSet` extension point + the system-prompt injection hook.

## Interfaces & Contracts
```ts
// /lib/memory/rules.ts
export async function loadMemory(userId: string): Promise<{
  promptSummary: string;                 // compact, injected into system prompt by B1
  budgetExclusions: { category: string; from: string }[];
}>;

// budget query (in queries.ts)
export async function getBudgetStatus(userId: string, args: {
  category?: string; period?: "month";
}): Promise<{
  category: string; limitCents: number; spentCents: number;
  pctUsed: number; remainingCents: number; exclusionsApplied: string[];
}>;
```

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| "Don't count rent in my food budget" | persist `exclude_category_from_budget`; `getBudgetStatus` excludes rent from food spend; card shows "excluding rent" | `§9`, `§15`, `UI_SPEC §5.4` |
| "I get paid on the 1st" | persist `income_day` fact; surfaced in prompt summary, applied where relevant | `§15` |
| Spend at 80% / 100% of limit | return % so UI can warn/danger (`UI_SPEC §4.3`) | `SPEC §3` capability 6 |
| No budget set for category | inconclusive/empty state, not an error | `UI_SPEC §6` |
| Conflicting/duplicate rule | upsert/replace deterministically; last write wins, recorded | robustness |
| Excluded category has no spend | exclusion is a no-op; still note it was applied | honesty |

## Reuse
- `schema.sql`: `user_memory` (139–149), `budgets` (123–132), and the explicit implementer note that
  `getBudgetStatus` **must** apply `exclude_category_from_budget` rules (292–293).
- `A3` `rollups` for current-month spend.
- `00-contracts` `UserMemoryRule`.

## Acceptance criteria
- [ ] Saying "don't count rent in my food budget" persists a rule that **visibly changes**
      `getBudgetStatus` output (food spend drops by rent). (`§15`)
- [ ] `setBudget` then `getBudgetStatus` returns correct limit/spend/%/remaining. (`SPEC §3` cap 6)
- [ ] Budget status reports the applied exclusions list for the UI note. (`UI_SPEC §5.4`)
- [ ] Rule summary is injected into the system prompt (no extra tool round-trip for facts). (`SPEC §5`)

## Verification
1. `pnpm dev`: set a food budget, ingest data incl. rent miscategorized into food (or a rent txn),
   ask budget status → note the number. Say "don't count rent in my food budget" → ask again → number
   changes and card shows "excluding rent". This is the graded proof.
2. Supabase MCP: confirm the `user_memory` and `budgets` rows.
3. Unit-test the exclusion math in `getBudgetStatus` against a fixture.

## Commit / PR boundary
- `feat(memory): user_memory loader + prompt summary + saveMemory tool`
- `feat(budgets): setBudget + getBudgetStatus with exclusion-rule application`

## Assumptions / Open questions
- Warn threshold 80%, danger 100% (matches `UI_SPEC §4.3`) — record if changed.
- "Apply rule" is deterministic in the query layer; the model only *captures* the rule via
  `saveMemory`, it does not enforce it in-context.
