# PRD-A1 — Foundation: Scaffold · Auth · DB Client · Schema

| | |
|---|---|
| **ID** | `A1` |
| **Epic** | A — Data plane |
| **Status** | `todo` |
| **SPEC §12 window** | 0:00–0:30 |
| **Est. effort** | 30–45 min |
| **Cuttable?** | no |

---

## Context
Commodity work to get off the table fast (`SPEC §12`). Stands up the Next.js App Router + TS-strict
project, wires Supabase Auth, applies the (already-written) `schema.sql`, and — critically —
establishes the **single auth touchpoint** `getCurrentUser()` and an RLS-respecting server client.
Per `SPEC §10` and the `schema.sql` implementer note (lines 294–296), tenant isolation is correct
only if the server client is bound to the user JWT so `auth.uid()` resolves; getting this binding
wrong silently breaks isolation even though the policies are right. This is the "build vs buy" signal
(`SPEC §7`): auth is bought, not built.

## Scope — In
- Project scaffold: `package.json` (pnpm), `tsconfig.json` (strict), `next.config.js`, Tailwind +
  shadcn/ui init (`UI_SPEC §3` stack), `.gitignore`, ESLint/Prettier minimal.
- `.env.example` — exactly the keys in `SPEC §11` (Supabase URL/anon/service-role, model provider
  keys, `ROUTER_MODEL`/`VISION_MODEL`/`REASONING_MODEL`, `TAVILY_API_KEY`).
- `/lib/db/client.ts` — the **only** auth touchpoint:
  - `getServerClient()` — `@supabase/ssr` server client bound to the request's session cookies/JWT
    (RLS-respecting; never service-role on request paths).
  - `getCurrentUser()` — resolves the authenticated user or `null`; the single helper app code calls.
  - (optional) `getServiceClient()` — service-role, server-only, used **only** for migrations/seed,
    never reachable from a request path.
- `/app/(auth)/login/page.tsx` — Supabase auth UI (email/password or magic link — whichever is
  fastest, `SPEC §10`).
- Auth middleware/guard redirecting unauthenticated users to `/login`.
- `/app/chat/page.tsx` — minimal authenticated shell (real UI is `B2`); proves the session round-trip.
- Apply `schema.sql` to the Supabase project (SQL editor or `supabase db push`).

## Scope — Explicitly Out
- ❌ The actual chat UI / result cards → `B2`.
- ❌ Any tools, queries, orchestrator → `B1`.
- ❌ Editing `schema.sql` → it is complete; A1 *applies* it, does not change it.
- ❌ Multi-conversation management, profile editing → out (`UI_SPEC §8` simplifications).
- ❌ Using the service-role key on any request path → forbidden (`SPEC §10`, `schema.sql` 8–11).

## Dependencies
- `00-contracts` — chat request/message shapes (only lightly needed here for the shell).
- `schema.sql` (exists) — the DDL to apply.

## Interfaces & Contracts
```ts
// /lib/db/client.ts — the ONLY place app code touches auth/db construction
export function getServerClient(): SupabaseClient;          // RLS-bound (cookies/JWT)
export async function getCurrentUser(): Promise<User | null>;
// server-only, NOT exported to client bundles:
export function getServiceClient(): SupabaseClient;         // migrations/seed only
```
Every downstream PRD obtains its DB handle via `getServerClient()` and identity via
`getCurrentUser()` — no direct `createClient` calls elsewhere (keeps the auth provider swappable per
`SPEC §3` and the README evolution path).

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Unauthenticated request to `/chat` or any `/api/*` | redirect to `/login` (UI) / 401 (API) | `SPEC §10` |
| Supabase free-tier project paused | document the resume step in README | `SPEC §11`, README 148 |
| User B requests user A's rows | returns nothing — RLS denies (verify, don't assume) | `SPEC §15` |
| Session cookie present but expired | treat as unauthenticated; refresh per `@supabase/ssr` | `SPEC §10` |

## Reuse
- `schema.sql` (whole file) — apply as-is; note the auto-profile trigger (lines 27–43) means signup
  needs no app-side profile insert.
- `@supabase/ssr` (verify current App Router cookie API — see the **supabase** skill).
- shadcn/ui primitives (`UI_SPEC §4`).
- README §"Running it locally" (lines 123–148) — setup steps to validate against.

## Acceptance criteria
- [ ] A new user can sign up and land on `/chat` (empty shell). (`§15: new user … empty state`)
- [ ] `getCurrentUser()` is the only auth call in the codebase (grep confirms). (`SPEC §3`)
- [ ] RLS isolation proven: user B's session cannot read user A's `transactions`. (`§15`)
- [ ] No service-role key referenced in any `/app/api` or client path. (`SPEC §10`)
- [ ] `.env.example` matches `SPEC §11` exactly.

## Verification
1. `pnpm install && pnpm dev` → `/login` renders; sign up → redirected to `/chat`.
2. Apply schema: run `schema.sql` in Supabase SQL editor; confirm 12 tables + `receipts` bucket
   (Supabase **MCP**: list tables, list buckets).
3. RLS check (Supabase MCP / SQL): as user A insert a `transactions` row; with user B's JWT, select
   → 0 rows. Document the result.
4. `grep -rn "createClient\|auth.getUser\|service_role" app lib` → only `lib/db/client.ts` matches.

## Commit / PR boundary
- `chore: scaffold next.js app-router + tailwind + shadcn + tsconfig strict`
- `feat(auth): supabase auth, getCurrentUser, RLS-bound server client`
- `chore(db): apply schema.sql; document setup`

## Assumptions / Open questions
- Auth method: email/password unless magic link is faster to wire — record the choice in README.
- Schema applied manually via SQL editor for the demo (no migration tooling) — noted as a simplification.
