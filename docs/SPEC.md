# Personal Finance Assistant — Engineering Spec

> **Purpose of this document.** This is a decision-locked build spec for an AI coding agent (Claude Code). Every architectural and stack decision is already made and aligned. Do not re-litigate choices; implement them. Where a third-party library API is version-volatile (notably the Vercel AI SDK and Supabase client), **verify the exact call signatures against current official docs at install time** — the architecture and contracts below are stable, the SDK method names may have moved.

> **Context.** This is a 6-hour take-home assessment. The goal is a narrow vertical slice that genuinely works, plus a design note. Finishing every feature is explicitly *not* the goal. Scope ruthlessly per the build plan in §12. Commit incrementally.

---

## 1. The thesis (read this first — it governs every decision)

A naive finance assistant pipes transaction rows into an LLM and asks it to reason. That fails on cost, latency, and scale simultaneously, and breaks the moment a user has years of history (context overflow).

**This system is built on one rule: raw transaction rows almost never enter the model's context.**

The LLM is a *router and orchestrator* over deterministic tools. Math happens in Postgres. Heavy analytics are *precomputed offline at ingest*, not per request. The model translates intent into typed tool calls and narrates results. This is what makes the design fast, cheap, and scalable to 10×–100× the sample data.

Two consequences shape the whole codebase:
- **Two planes.** A *write path* (offline: ingest → clean → precompute) and a *read path* (online: per-request, reads small pre-aggregated tables). They are separated in the code, not interleaved.
- **Tiered effort.** Requests route to the cheapest sufficient tool. A balance lookup is a SQL read; an unknown-merchant lookup earns a heavier agentic model with web access. Effort scales with the task, never uniformly.

---

## 2. Locked tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | One language, one repo. |
| Framework | Next.js (App Router) | Frontend + API route handlers + streaming in one deployable. |
| Auth + multi-tenancy | Supabase Auth + Postgres **Row-Level Security** | Isolation enforced at the DB, not in app code. |
| Database | Supabase Postgres | Window functions / `date_trunc` do rollups natively. |
| File storage | Supabase Storage | Receipt images; signed URLs feed the vision model. |
| LLM orchestration | **Vercel AI SDK** (`ai` + `@ai-sdk/*` providers) | Model-agnostic; tool-calling loop; multimodal. Verify v5 API at install. |
| Validation | **Zod** | One schema language for tool args, OCR output, CSV rows. |
| CSV parsing | `papaparse` | |
| Web search (Tier 3) | Tavily (or Exa) | Behind a single adapter; rare calls. |
| Deploy | Vercel | `pnpm` preferred. |

**Model tiering (all behind env vars so they are swappable in one line):**

| Env var | Role | Class (pick current cheapest-capable) |
|---|---|---|
| `ROUTER_MODEL` | Orchestrator + Tier-0/1 narration + classification | Gemini Flash-Lite / Claude Haiku / GPT-mini class |
| `VISION_MODEL` | Receipt OCR (Tier 2) | Gemini Flash (vision) class |
| `REASONING_MODEL` | Synthesis + agentic (Tier 3/4) | Claude Sonnet / GPT-5-class workhorse |

> Do not hard-code model strings in business logic. Read them from env, resolve the provider via the AI SDK provider registry, and pass the resolved model into each call.

---

## 3. Repository structure

```
/app
  /(auth)/login/page.tsx           # Supabase auth UI
  /chat/page.tsx                   # main assistant UI (streaming)
  /api
    /chat/route.ts                 # POST: orchestrator entrypoint (streams)
    /ingest/route.ts               # POST: CSV upload → clean → precompute
    /receipts/route.ts             # POST: image upload → vision extract → draft
    /receipts/confirm/route.ts     # POST: user confirms extracted receipt
/lib
  /db
    client.ts                      # Supabase server client (RLS-respecting)
    queries.ts                     # parameterized query functions (NOT text-to-SQL)
  /agent
    orchestrator.ts                # builds tool set, runs AI SDK loop with ROUTER_MODEL
    tools.ts                       # typed tool definitions (Zod schemas + handlers)
    models.ts                      # env → resolved AI SDK model providers
    prompts.ts                     # system prompts (router, synthesis, merchant)
  /ingest
    parse.ts                       # papaparse + per-row normalize/validate (Zod)
    dedup.ts                       # content hashing
    pipeline.ts                    # orchestrates parse→dedup→insert→batch jobs
  /batch
    rollups.ts                     # recompute time-bucketed aggregates
    subscriptions.ts               # recurring-charge detection
    anomalies.ts                   # z-score anomaly scoring
    categorize.ts                  # rules-first, cheap-model fallback
  /memory
    rules.ts                       # read/apply deterministic user rules
  /search
    web.ts                         # Tavily/Exa adapter
/db
  schema.sql                       # tables + indexes + RLS policies
  seed.sql                         # optional: categories
/components                        # chat UI, message list, receipt drawer, budget bar
/types                             # shared TS types (mirror Zod where useful)
README.md                          # the design note (see §14)
.env.example
```

Auth must sit behind a single `getCurrentUser()` helper in `/lib/db/client.ts`. **Never sprinkle Supabase auth calls through the app** — this keeps the auth provider swappable, which is a graded "build vs buy / flexibility" signal.

---

## 4. Data model

All amounts are stored as **integer minor units** (cents) to avoid float drift. All user-scoped tables carry `user_id uuid` and an RLS policy `user_id = auth.uid()`.

### 4.1 Tables (`/db/schema.sql`)

```sql
-- Profiles (app-level user data; auth.users is managed by Supabase)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  default_currency text not null default 'USD',
  created_at timestamptz not null default now()
);

-- Raw transactions (the heavy table; rarely read row-by-row)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  txn_date date not null,
  amount_cents bigint not null,          -- negative = spend, positive = income
  currency text not null default 'USD',
  merchant_raw text,                     -- as received
  merchant_norm text,                    -- normalized for grouping/matching
  category text not null default 'uncategorized',
  description text,
  source text not null,                  -- 'csv' | 'bank' | 'receipt' | 'manual'
  content_hash text not null,            -- dedup key
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, content_hash)
);
create index on transactions (user_id, txn_date);
create index on transactions (user_id, category, txn_date);
create index on transactions (user_id, merchant_norm);

-- Precomputed time-bucketed aggregates (the read path's bread and butter)
create table rollups (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null,             -- 'month' (ship), 'week'/'day' (optional)
  period_start date not null,
  category text not null,                -- '__all__' row plus per-category rows
  total_spend_cents bigint not null,     -- spend only (positive number)
  total_income_cents bigint not null,
  txn_count int not null,
  primary key (user_id, period_type, period_start, category)
);

-- Detected recurring charges
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_norm text not null,
  cadence_days int,                      -- ~30 monthly, ~7 weekly, ~365 annual
  avg_amount_cents bigint not null,
  last_seen date not null,
  next_expected date,
  confidence real not null,              -- 0..1
  status text not null default 'active', -- 'active' | 'dismissed'
  unique (user_id, merchant_norm)
);

-- Anomaly flags (precomputed at ingest)
create table anomalies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  type text not null,                    -- 'amount_spike' | 'new_merchant' | 'category_spike'
  score real not null,                   -- z-score or similar
  reason text not null,                  -- human-readable
  status text not null default 'new',    -- 'new' | 'seen' | 'dismissed'
  created_at timestamptz not null default now()
);
create index on anomalies (user_id, status);

-- Budgets
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,                -- '__all__' for total budget
  period_type text not null default 'month',
  limit_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (user_id, category, period_type)
);

-- Deterministic user memory (rules) + soft facts, one table, discriminated
create table user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                    -- 'rule' | 'fact'
  type text not null,                    -- e.g. 'exclude_category_from_budget', 'income_day', 'free_text'
  params jsonb not null default '{}',    -- e.g. {"exclude":"rent","from":"food_budget"} or {"day":1}
  text text,                             -- original phrasing for fact/free_text
  created_at timestamptz not null default now()
);
create index on user_memory (user_id, kind);

-- Chat history
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,                    -- 'user' | 'assistant' | 'tool'
  content text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

-- Receipt uploads
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  extracted jsonb,                       -- structured OCR output (validated)
  confidence real,                       -- overall extraction confidence 0..1
  linked_transaction_id uuid references transactions(id) on delete set null,
  status text not null default 'pending',-- 'pending' | 'confirmed' | 'rejected'
  created_at timestamptz not null default now()
);

-- Ingest error quarantine (do NOT silently drop bad rows)
create table ingest_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_row jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);
```

### 4.2 RLS (mandatory)

Enable RLS on **every** user-scoped table and add a policy per operation:

```sql
alter table transactions enable row level security;
create policy "own_rows" on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Repeat for: profiles(id=auth.uid()), rollups, subscriptions, anomalies,
-- budgets, user_memory, conversations, messages, receipts, ingest_errors.
```

This is the entire multi-user isolation story. App code uses a Supabase client bound to the user's JWT so `auth.uid()` resolves correctly; do not use the service-role key on request paths.

---

## 5. The orchestrator (read path)

`/lib/agent/orchestrator.ts` exposes one function the chat route calls:

```ts
streamAssistantReply({ userId, conversationId, messages }) -> stream
```

It runs a **single AI SDK tool-calling loop** with `ROUTER_MODEL`. The cheap model IS the router — it sees the full tool set and selects. Heavy work is delegated *inside* the tools (a tool may internally call `REASONING_MODEL`); the orchestrator itself stays cheap.

Loop rules:
1. Load the user's `user_memory` rules and inject a compact summary into the system prompt (so the model applies "don't count rent in food budget" without a tool round-trip).
2. Let the model call tools. Max ~4 tool steps per turn (guard against loops).
3. Stream the final narration to the client.
4. Persist user + assistant messages.

Verify the exact AI SDK construct for the multi-step tool loop (`streamText` with `tools` and step control) against current docs.

### 5.1 Tools (`/lib/agent/tools.ts`)

Each tool = Zod input schema + handler that calls a **parameterized** query in `/lib/db/queries.ts`. **There is no text-to-SQL.** The model never emits SQL.

| Tool | Tier | Input (Zod) | Returns | Backed by |
|---|---|---|---|---|
| `getSpending` | 0 | `{ category?, startDate, endDate, groupBy?: 'category'\|'month' }` | totals | `SUM` grouped query on `transactions` |
| `getTransactions` | 0 | `{ filters:{category?,merchant?,min?,max?,startDate?,endDate?}, sort, limit<=50 }` | rows | indexed select |
| `getTrend` | 1 | `{ category?, periods: number }` | rollup series | reads `rollups` |
| `getSubscriptions` | 1 | `{}` | active subs | reads `subscriptions` |
| `getAnomalies` | 1 | `{ status?: 'new'\|'all' }` | flagged txns | reads `anomalies` |
| `getBudgetStatus` | 0 | `{ category?, period? }` | limit vs spend, % used | join budgets + current rollup, **apply exclusion rules** |
| `setBudget` | 0 | `{ category, period?, limitAmount }` | confirmation | upsert `budgets` |
| `saveMemory` | 0 | `{ kind, type, params, text? }` | confirmation | insert `user_memory` |
| `lookupMerchant` | 3 | `{ merchantName }` | likely identity + source | **agentic**: web search adapter + `REASONING_MODEL` |
| `summarizeFinances` | 4 | `{ period? }` | prose summary | reads `rollups`, calls `REASONING_MODEL` |
| `suggestCutbacks` | 4 | `{}` | ranked suggestions w/ numbers | reads `rollups`+`subscriptions`, `REASONING_MODEL` |
| `askClarification` | — | `{ question }` | (signals UI to ask) | returns the question; ends turn |

Rules for tool design:
- Every query is bounded (date ranges, `limit <= 50`). No unbounded scans on the request path — this caps cost/latency and is a graded scalability signal.
- Long-history questions ("am I spending more than usual?") **must** use `getTrend` over `rollups`, never `getTransactions` over raw rows.
- `lookupMerchant` runs its own small loop: search → read top results → `REASONING_MODEL` summarizes likely merchant identity; on no result, return "could not determine" rather than hallucinating.

---

## 6. Ingestion pipeline (write path)

`/api/ingest` accepts the sample CSV (and is the same path a mock-bank pull would use). `/lib/ingest/pipeline.ts`:

1. **Parse** with papaparse (tolerant: handle odd delimiters/quoting).
2. **Per row, normalize + validate** with a Zod schema: coerce dates (multiple formats), parse amounts to integer cents, trim/uppercase `merchant_norm`, default missing category to `uncategorized`.
3. **Quarantine, don't drop.** Rows that fail validation go to `ingest_errors` with a reason. Return a summary: `{ imported, skipped, reasons[] }`.
4. **Dedup** via `content_hash = sha256(user_id|txn_date|amount_cents|merchant_norm|description)`. The `unique(user_id, content_hash)` constraint makes inserts idempotent — re-uploading the same CSV is a no-op.
5. **Run batch jobs** (§7) for the affected user.

For the demo, batch jobs run **synchronously** at the end of ingest. Production path (described in README, not built): enqueue to a worker (Inngest / Trigger.dev / `pg_cron`) because serverless functions are hostile to long-running work.

---

## 7. Batch / precompute jobs (`/lib/batch`)

Run at ingest; idempotent; scoped to one user.

- **categorize.ts** — rules first (merchant→category map + keyword rules). Only uncategorized rows fall through to a single cheap-model batch call. Never one model call per row.
- **rollups.ts** — recompute `rollups` for affected months: per `(month, category)` and a `__all__` row. `INSERT ... ON CONFLICT DO UPDATE`. This table is the answer to "compare across time" and "data 10×–100× larger" — its size scales with time periods, not row count.
- **subscriptions.ts** — group by `merchant_norm`; detect repeating intervals (cluster gaps near 7/30/365 days with stable amounts); upsert with a confidence score and `next_expected`.
- **anomalies.ts** — per category, compute rolling mean/stddev of transaction amounts; flag z-score > threshold (`amount_spike`), first-time merchants (`new_merchant`), and month-over-month category jumps (`category_spike`). Insert into `anomalies`. **Ship a z-score; name the ML upgrade path in the README** — do not build an ML model.

---

## 8. Receipt OCR flow (Tier 2)

1. `/api/receipts` accepts an image → store in Supabase Storage → row in `receipts` (status `pending`).
2. Call `VISION_MODEL` with the image and a **structured-extraction prompt**; parse into a Zod schema: `{ merchant, date, total, currency, lineItems[], confidence }`.
3. **Confidence gate.** If overall confidence < threshold (e.g. 0.7) or required fields missing → return a *draft* to the chat UI and ask the user to confirm/correct. **Never silently record a wrong amount.**
4. On `/api/receipts/confirm` → insert a `transaction` (`source='receipt'`), link it, set `receipts.status='confirmed'`, trigger rollups.
5. Handle rotation/foreign language by instructing the vision model to handle them; on hard failure, fall back to manual entry fields prefilled with whatever was extracted.

---

## 9. Edge cases & failure handling (graded heavily — wire these, don't skip)

| Situation | Required behavior |
|---|---|
| Blurry / rotated / foreign receipt | Vision model handles rotation/language; confidence gate catches blur → confirm-with-user; manual fallback. |
| Messy CSV (dupes, missing fields, junk) | Validation + quarantine to `ingest_errors`; idempotent dedup; return import summary with skip reasons. |
| Ambiguous question | `askClarification` — ask one focused question rather than guessing. |
| Unanswerable from data | Say so plainly; offer the closest thing the data supports. Never fabricate. |
| Contradicting sources (receipt vs bank txn) | Match on date+amount+merchant; if a near-duplicate exists, surface the conflict and ask which to keep — don't double-count. |
| Slow/expensive-if-naive request | Routing + rollups prevent it; long ranges hit `getTrend`, never raw rows. |
| New requirement introduced mid-eval | Adding a capability = one new tool + one routing line. The tool boundary is the adaptability story. |

---

## 10. Auth & multi-tenancy

- Supabase Auth (email/password or magic link — whichever is fastest to wire).
- Every request path uses a Supabase client bound to the user session JWT; RLS does the rest.
- Service-role key only in trusted server-only contexts (never reachable from the client; ideally not used on request paths at all).
- `getCurrentUser()` is the only auth touchpoint app code may call.

---

## 11. Environment & config (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only, used for migrations/seed if needed
# Model providers (set the one(s) you use)
GOOGLE_GENERATIVE_AI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
# Model tier selection (provider:model strings resolved in models.ts)
ROUTER_MODEL=
VISION_MODEL=
REASONING_MODEL=
# Web search
TAVILY_API_KEY=
```

README must include: `pnpm install`, how to run `schema.sql` against Supabase, how to seed the sample CSV, `pnpm dev`, and a note that a paused free-tier Supabase project must be resumed in the dashboard.

---

## 12. Build plan (6 hours — strict ordering, commit after each)

| Window | Deliverable | Why this order |
|---|---|---|
| 0:00–0:30 | Scaffold Next.js + Supabase, auth, `.env`, `getCurrentUser()` | Commodity; get it off the table fast. |
| 0:30–1:30 | `schema.sql` + RLS + ingest the sample CSV with cleaning/dedup/quarantine | Nothing works without data; the cleaning is graded. |
| 1:30–2:30 | Batch jobs: rollups + subscriptions (z-score anomalies if time) | The precompute that makes the read path cheap. |
| 2:30–4:00 | Orchestrator + Tier-0/1 tools + streaming chat UI + memory rules | The product's heart; proves routing + cost discipline. |
| 4:00–5:00 | Receipt OCR with confidence gate | Multimodal + failure handling. |
| 5:00–5:30 | `lookupMerchant` agentic web tool | Agentic reasoning signal. |
| 5:30–6:00 | README/design note (§14) + deploy to Vercel | Communication is graded; a deployed link beats "runs on my machine". |

If running behind: cut in this order — merchant lookup → anomalies → receipt OCR. **Never** cut: ingest cleaning, RLS, the routing/tool layer, or the README. A narrow slice that works beats broad and broken.

---

## 13. Non-goals (explicit stubs/cuts — list these in the README)

- Real bank integration — use the provided mock/CSV only.
- Production job queue — batch runs synchronously; queue is described, not built.
- ML-grade anomaly detection — z-score only; upgrade path named.
- Multi-currency FX conversion — store currency, assume single currency for math.
- Budget periods beyond monthly.
- Comprehensive test suite — a few unit tests on ingest cleaning + dedup is enough to signal.
- Mobile-native UI — responsive web only.

---

## 14. The design note (README) — what it MUST cover

The README is graded as heavily as the code. Cover, honestly and concisely:
1. **What's built vs stubbed vs skipped**, and why (point to §13).
2. **The thesis** (§1): raw rows don't enter context; routing + precompute. This is the headline.
3. **Architecture**: the two planes and the tiered router (a diagram or clear prose).
4. **Key decisions + trade-offs**: TS over Python's data ergonomics (shipping a streaming slice mattered more); typed tools over text-to-SQL (security + cost + latency); RLS for isolation; rollups for scale; cheap-model routing for economics.
5. **Cost story**: fixed infra is small/flat; per-interaction is a fraction of a cent because the common path is a cheap-model call over precomputed reads — vs 1–2 orders of magnitude more for a naive frontier-over-raw-rows design.
6. **Scale story**: rollups scale with time periods not row count, so 10×–100× data leaves the read path untouched.
7. **Known evolution paths**: serverless → dedicated worker for batch/long agentic loops; z-score → ML; Supabase Auth → Clerk (behind `getCurrentUser()`).
8. **Challenges hit and how they were handled.**

---

## 15. Definition of done (acceptance criteria)

- A new user can sign up, land in an empty state, and is isolated by RLS (verified: user B cannot read user A's rows).
- Uploading the sample CSV reports `{imported, skipped, reasons}` and is idempotent on re-upload.
- "How much did I spend on groceries last month?" returns a correct number via `getSpending` in well under a couple of seconds, with no raw rows in the model context.
- "Am I spending more than usual this month?" answers via `getTrend`/rollups.
- At least one of: subscriptions list, anomaly flags, or budget tracking works end-to-end.
- A receipt photo produces an extracted draft; low confidence triggers a confirm step; confirming creates a linked transaction.
- An unknown merchant query triggers `lookupMerchant` and returns a sourced guess or an honest "couldn't determine".
- Saying "don't count rent in my food budget" persists a rule that visibly changes `getBudgetStatus`.
- README covers §14.
- App is deployed and the repo has incremental commits.
