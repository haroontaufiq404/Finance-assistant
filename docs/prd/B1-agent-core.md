# PRD-B1 — Agent Core: Models · Tools · Orchestrator · `/api/chat`

| | |
|---|---|
| **ID** | `B1` |
| **Epic** | B — Agent plane (read path) |
| **SPEC §12 window** | 2:30–4:00 |
| **Status** | `todo` |
| **Est. effort** | 90 min |
| **Cuttable?** | no — the product's heart; proves routing + cost discipline |

---

## Context
The read path and the central thesis made concrete (`SPEC §1`, §5): a cheap `ROUTER_MODEL` runs a
single tool-calling loop, selecting typed tools that compile to **parameterized, bounded** SQL over
**precomputed** tables. Raw rows never enter context; math happens in Postgres; effort tiers by task.
**There is no text-to-SQL** — the model never emits SQL (`SPEC §5.1`). New capabilities later =
one new tool + one routing line (the adaptability story, `SPEC §9`).

## Scope — In
- `/lib/agent/models.ts` — env → resolved AI SDK provider models for `ROUTER_MODEL`, `VISION_MODEL`,
  `REASONING_MODEL`. **No hard-coded model strings in business logic** (`SPEC §2`).
- `/lib/db/queries.ts` — parameterized query functions (one per tool need); range- and row-bounded
  (`limit <= 50`); no unbounded scans on the request path.
- `/lib/agent/tools.ts` — the `SPEC §5.1` tools as AI SDK tool defs (Zod input from `00-contracts` +
  handler calling `queries.ts`). This PRD owns the Tier-0/1 + Tier-4 read tools:
  `getSpending`, `getTransactions`, `getTrend`, `getSubscriptions`, `getAnomalies`,
  `summarizeFinances`, `suggestCutbacks`, `askClarification`.
  (Budget tools live in `B3`; `lookupMerchant` in `C2` — both register into this same tool set.)
- `/lib/agent/prompts.ts` — router system prompt, synthesis prompt, (merchant prompt stub for C2).
- `/lib/agent/orchestrator.ts` — `streamAssistantReply({userId, conversationId, messages})`: loads
  `user_memory` rule summary into the system prompt (B3 supplies the loader), runs the AI SDK
  multi-step tool loop with `ROUTER_MODEL` (**max ~4 steps**), streams narration, persists messages.
- `/api/chat/route.ts` — `POST`, auth via `getCurrentUser()`, returns the stream.

## Scope — Explicitly Out
- ❌ Budget tools (`getBudgetStatus`/`setBudget`) + memory rule loader/`saveMemory` → `B3` (they
  register into this tool set but B3 owns them and the exclusion logic).
- ❌ `lookupMerchant` + web adapter → `C2`.
- ❌ Receipt tools/flow → `C1`.
- ❌ Any UI / streaming rendering → `B2` (this PRD owns the *server* stream contract only).
- ❌ Writing rollups/subscriptions/anomalies → `A3` (B1 only reads them).
- ❌ Text-to-SQL or unbounded queries → forbidden (`SPEC §5.1`).

## Dependencies
- `00-contracts` — every tool's input/output Zod schema; chat request/message shapes.
- `A1` — `getCurrentUser()`, `getServerClient()`.
- `A3` — the populated `rollups` / `subscriptions` / `anomalies` tables the read tools query.

## Interfaces & Contracts
```ts
// /lib/agent/orchestrator.ts
export function streamAssistantReply(args: {
  userId: string;
  conversationId: string | null;
  messages: ChatMessage[];        // from 00-contracts
}): ReadableStream;               // AI SDK stream (verify v5 construct at install)

// /lib/agent/models.ts
export function routerModel(): LanguageModel;
export function reasoningModel(): LanguageModel;
export function visionModel(): LanguageModel;   // used by C1

// /lib/agent/tools.ts
export function buildToolSet(ctx: { userId: string }): ToolSet;  // B3/C1/C2 extend this
```
**Stream contract** is what `B2` binds to — tool results are emitted as typed `ResultCardData`
(from `00-contracts`) alongside streamed narration tokens.

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Ambiguous / under-specified question | `askClarification` — one focused question, end turn | `§9` |
| Unanswerable from data | say so plainly, offer closest supported; never fabricate | `§9` |
| "Am I spending more than usual?" (long history) | route to `getTrend` over `rollups`, never raw rows | `§9`, `§15` |
| Model loops / over-calls tools | hard cap ~4 steps; then synthesize from what's gathered | `SPEC §5` |
| Unbounded request (huge date range, big limit) | clamp ranges; `limit <= 50`; prefer rollups | `SPEC §5.1` |
| `getTransactions` for "biggest purchase" | bounded indexed select, sort+limit — not a full scan | `SPEC §5.1` |
| Tool handler throws | return a tool error the model can narrate gracefully, don't 500 | robustness |

## Reuse
- `SPEC §5.1` tool table — the authoritative tool list, tiers, inputs, backing query.
- `00-contracts` tool schemas (don't redefine).
- `schema.sql` indexes (65–67, 118, 171) — write queries that hit them.
- Vercel AI SDK `streamText` + tools + step control (`SPEC §5` — **verify v5 API at install**; see
  the **claude-api** skill if using Anthropic models).
- `A3` tables for Tier-1 reads.

## Acceptance criteria
- [ ] "How much did I spend on groceries last month?" → correct number via `getSpending`, <~2s, with
      **no raw transaction rows in the model context**. (`§15`)
- [ ] "Am I spending more than usual this month?" → answered via `getTrend`/rollups. (`§15`)
- [ ] Model never emits SQL; all DB access is via `queries.ts` parameterized functions. (`SPEC §5.1`)
- [ ] Tool loop is capped (~4 steps); verified it can't spin. (`SPEC §5`)
- [ ] Model strings come only from env via `models.ts` (grep: no literal model ids in handlers).
- [ ] User + assistant messages persisted to `messages`. (`SPEC §5`)

## Verification
1. `pnpm dev` → ask the two `§15` questions; confirm a fast, correct answer.
2. Instrument/log the model request payload → assert no raw transaction rows present (only tool
   args/results). This is the headline thesis check.
3. Ask an ambiguous question → assistant asks one clarifying question (no guess).
4. Ask something unanswerable → honest "can't determine from your data".
5. Swap `ROUTER_MODEL` env to another provider → still works without code change.

## Commit / PR boundary
- `feat(agent): env-driven model resolution (models.ts)`
- `feat(db): parameterized bounded query functions (queries.ts)`
- `feat(agent): typed read tools (getSpending/getTransactions/getTrend/...)`
- `feat(agent): orchestrator tool loop + /api/chat streaming + message persistence`

## Assumptions / Open questions
- Default tier-model classes per `SPEC §2` table; record the exact `ROUTER/VISION/REASONING` strings
  chosen in `.env.example` + README.
- One active conversation is acceptable for the demo (`UI_SPEC §8`).
