# Personal Finance Assistant

An AI-driven, multi-user financial companion. Users sign in, bring in their transaction history, and talk to an assistant in plain language about their money — including by uploading a photo of a receipt.

**Live demo:** `TODO: <vercel-url>` · **Repo:** `TODO: <github-url>`

> This README is also the design note. It explains what was built, the decisions behind it, and what was deliberately left out under the 6-hour, single-sitting constraint.

---

## The one idea this is built on

A naive finance assistant pipes transaction rows into an LLM and asks it to reason. That fails on cost, latency, and scale at once, and breaks the moment a user has years of history (the data won't fit in context).

**So this system is built on one rule: raw transaction rows almost never enter the model's context.**

The LLM is a *router and orchestrator* over deterministic tools. Math happens in Postgres. Heavy analytics (recurring-charge detection, anomaly scoring, time-series rollups) are **precomputed offline at ingest**, not per request. The model translates a question into a typed tool call and narrates the result. Two structural consequences follow, and they shape the whole codebase:

- **Two planes.** A *write path* (offline: ingest → clean → precompute) and a *read path* (online: per-request, reads small pre-aggregated tables). They're separated in the code, not interleaved.
- **Tiered effort.** Requests route to the cheapest sufficient tool. A balance lookup is a SQL read; an unknown-merchant lookup earns a heavier agentic model with web access. Effort scales with the task, never uniformly.

`TODO: drop the two architecture diagrams (data planes + routing tiers) here as images.`

```
            WRITE PATH (offline, async)                 READ PATH (online, per request)
   CSV / mock bank → ingest (dedup, validate,      user → chat API → LLM orchestrator
   quarantine) → batch jobs (categorize,                         │  routes to typed tools
   detect subscriptions, score anomalies,                        ▼
   roll up by month)                               ┌─────────────────────────────────┐
            │                                       │ Tier 0  deterministic SQL        │
            ▼                                       │ Tier 1  precomputed reads        │
   ┌───────────────────────────────────┐           │ Tier 2  vision (receipt OCR)     │
   │ Postgres + row-level security      │ ◀── reads │ Tier 3  agentic + web search     │
   │ transactions (raw) · rollups ·     │  aggregates Tier 4  LLM synthesis            │
   │ subscriptions · anomalies ·        │           └─────────────────────────────────┘
   │ budgets · user_memory              │
   └───────────────────────────────────┘
```

---

## What's built

Mapping the product capabilities to what's actually implemented. `TODO: update each status to reflect reality before submitting — be honest; a narrow slice that works beats broad and broken.`

| # | Capability | Status | How it works |
|---|---|---|---|
| 1 | Answer spending questions | `TODO ✅/🟡/⛔` | `getSpending` / `getTransactions` — parameterized SQL, no raw rows in context |
| 2 | Read a receipt from a photo | `TODO` | Vision extraction → Zod validation → **confidence-gated confirm step** |
| 3 | Surface recurring subscriptions | `TODO` | Detected at ingest, stored in `subscriptions`, read on demand |
| 4 | Flag unusual activity | `TODO` | z-score / new-merchant / category-spike, precomputed into `anomalies` |
| 5 | Compare across time | `TODO` | `getTrend` over monthly `rollups` — the answer to "reason over long history" |
| 6 | Track a budget | `TODO` | `budgets` + `getBudgetStatus`, warns near/over limit |
| 7 | Look up unfamiliar charges | `TODO` | `lookupMerchant` — agentic loop with web search |
| 8 | Summarise finances | `TODO` | `summarizeFinances` over rollups, reasoning-tier model |
| 9 | Suggest where to cut back | `TODO` | `suggestCutbacks` over rollups + subscriptions |
| 10 | Remember user context | `TODO` | `user_memory` — deterministic rules reconfigure the query layer |

---

## Architecture & key decisions

### Tech stack

TypeScript end to end. **Next.js (App Router)** (frontend + API routes + streaming in one deployable), **Supabase** (Postgres + Auth + Storage + row-level security), **Vercel AI SDK** (model-agnostic tool-calling loop), **Zod** (one schema language for tool args, OCR output, and CSV validation), deployed on **Vercel**. Models are selected per tier behind environment variables (a cheap model for routing/narration, a vision model for OCR, a reasoning model for synthesis/agentic work), so swapping a provider is a one-line change.

### The decisions worth defending

**TypeScript over Python.** Python's data tooling (pandas) is genuinely nicer for the messy-CSV work, and it's the AI-native default. But for a 6-hour build that has to be a working streaming, multimodal, multi-user app, the single-language/single-repo path removes a second deploy and a pile of glue. The CSV cleaning here is a one-time ingest script — it doesn't need pandas. I optimized for shipping a working slice over ingest ergonomics.

**Typed tools, not text-to-SQL.** The orchestrator never emits SQL. It calls a fixed set of parameterized functions (`getSpending`, `getTrend`, …) that compile to safe, bounded queries. This closes an injection hole, caps per-query cost and latency (every query is range- and row-bounded), and makes the system's behavior predictable.

**Row-level security for isolation.** "Each user's data is private" is enforced at the database with RLS policies (`user_id = auth.uid()`), not in application code. App code can't accidentally leak across tenants, and the storage bucket for receipts is scoped the same way.

**Precomputed rollups for scale.** Long-history questions read a small monthly aggregate table, never the raw rows. The rollup table's size scales with *time periods*, not transaction count — so going from one month to several years, or from the sample data to 100× larger, leaves the read path untouched.

**A cheap model as the router.** The orchestrator runs the cheapest capable model and lets it select tools — routing is a classification task that small models do well. Only the tools that genuinely need reasoning (summaries, cut-back advice, merchant lookup) escalate to a stronger model internally.

### Cost & scale

The architecture is the cost story. The common case — a spending question — is a cheap-model call plus a short narration over a SQL result: well under a tenth of a cent per interaction. Receipt OCR on a cheap vision model is a fraction of a cent. The only genuinely expensive calls (plain-English summaries, cut-back advice on a reasoning-tier model) run over pre-aggregated rollups and are infrequent, landing around a cent or two. A naive design that feeds transaction history to a frontier model on every question costs one to two orders of magnitude more and breaks on long histories. Fixed infra is small and flat (managed Postgres + serverless hosting), and the read path keeps DB egress low by reading aggregates rather than raw rows.

### Edge cases handled

- **Messy CSV** (duplicates, missing fields, junk rows): validated per-row; bad rows are **quarantined** to an `ingest_errors` table and reported back as an import summary (`N added · M skipped, with reasons`) — never silently dropped. Dedup via a content hash makes re-uploading the same file idempotent.
- **Blurry / rotated / foreign-language receipt:** the vision model handles rotation and language; a confidence gate catches low-quality extractions and routes them to a user confirm step instead of recording a wrong amount; manual entry is the fallback.
- **Ambiguous question:** the assistant asks one focused clarifying question rather than guessing.
- **Unanswerable from data:** the assistant says so plainly and offers the closest supported answer instead of fabricating.
- **Contradicting sources (receipt vs. bank row):** near-duplicates are matched on date + amount + merchant and surfaced as a conflict to resolve, rather than double-counted.

---

## Assumptions

- A single base currency per user; amounts are stored as integer cents (no float drift). Multi-currency FX is out of scope.
- The provided sample CSV / mock endpoint stands in for a real bank connection.
- "Months" are the primary reporting period; weekly/daily rollups are supported by the schema but not all surfaced.
- `TODO: add any other assumptions you made while building.`

---

## What was intentionally skipped, stubbed, or simplified

Scoping is part of the exercise; here's where the 6 hours did and didn't go.

- **Real bank integration** — uses the mock/CSV only.
- **Production job queue** — batch jobs run synchronously at ingest. In production they'd move to a dedicated worker (Inngest / Trigger.dev / `pg_cron`), because serverless functions are hostile to long-running work. The two-plane design makes that a clean extraction, not a rewrite.
- **ML-grade anomaly detection** — ships a z-score / rolling-baseline heuristic. The upgrade path (per-category seasonal models, embeddings for merchant clustering) is named but not built.
- **Multi-conversation management, dark-mode toggle, exhaustive tests** — simplified or omitted; a few unit tests cover ingest cleaning and dedup as the high-signal cases.
- `TODO: list anything else you stubbed, and one line on why.`

---

## Challenges

`TODO: write 2–4 honest paragraphs on what was actually hard and how you handled it. Likely candidates, fill in the ones that happened:`
- *Getting Supabase's server client bound to the user JWT so RLS resolves `auth.uid()` correctly in the App Router — the policies are correct only if the session binding is.*
- *Confidence gating on receipt extraction: deciding the threshold and what "low confidence" should fall back to.*
- *Keeping the tool-calling loop bounded so the cheap router model doesn't spin on multi-step requests.*

---

## Running it locally

**Prerequisites:** Node 20+, `pnpm`, a free Supabase project, and an API key for at least one model provider.

```bash
# 1. install
pnpm install

# 2. configure
cp .env.example .env.local
#   fill in: Supabase URL + anon key, a model provider key,
#   the ROUTER_MODEL / VISION_MODEL / REASONING_MODEL strings,
#   and a Tavily (or Exa) key for merchant lookup.

# 3. database
#   Open the Supabase SQL editor and run db/schema.sql in full.
#   It creates all tables, RLS policies, the profile trigger,
#   and the private 'receipts' storage bucket.

# 4. run
pnpm dev
#   open http://localhost:3000, sign up, then upload the sample CSV
#   from the empty state to populate your account.
```

> **Note:** Supabase's free tier pauses a project after ~1 week of inactivity. If the demo looks empty or errors on load, resume the project in the Supabase dashboard.

### Environment variables

See `.env.example`. Model selection is per-tier via `ROUTER_MODEL`, `VISION_MODEL`, and `REASONING_MODEL` — change these to swap providers without touching code.

---

## Project structure

```
/app          Next.js routes — /chat (app), /api/chat, /api/ingest, /api/receipts
/lib/agent    orchestrator, typed tools, model resolution, prompts
/lib/ingest   CSV parse, validation, dedup, pipeline
/lib/batch    rollups, subscription detection, anomaly scoring, categorization
/lib/db       Supabase client + parameterized queries (no text-to-SQL)
/components   chat thread, composer, and the result cards
/db           schema.sql
```

---

## If this kept going (evolution paths)

- Move the write/batch plane to a dedicated worker + queue (the plane is already isolated).
- Replace the z-score heuristic with proper anomaly models and embedding-based merchant resolution.
- Swap Supabase Auth for Clerk/Auth0 if needed — it sits behind a single `getCurrentUser()` helper, so it's a contained change.
- Add weekly/daily rollups and richer budget periods (the schema already allows them).
