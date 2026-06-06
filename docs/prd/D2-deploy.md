# PRD-D2 — Deploy (Vercel) + Smoke Test

| | |
|---|---|
| **ID** | `D2` |
| **Epic** | D — Delivery |
| **SPEC §12 window** | 5:30–6:00 |
| **Status** | `todo` |
| **Est. effort** | 20–30 min |
| **Cuttable?** | no — "a deployed link beats 'runs on my machine'" (`SPEC §12`) |

---

## Context
Shipping is graded: the brief wants a **public repo with incremental commits** and a runnable app
(`SPEC §12`, brief §6). This PRD deploys the Next.js app to Vercel, wires the environment variables
to the production Supabase project, and runs a smoke test against the `SPEC §15` Definition of Done so
the live link demonstrably works — not just localhost.

## Scope — In
- Vercel project linked to the public GitHub repo; production build green.
- Environment variables set in the Vercel dashboard — every key from `.env.example` / `SPEC §11`
  (Supabase URL/anon, the chosen model provider key(s), `ROUTER/VISION/REASONING_MODEL` strings,
  `TAVILY_API_KEY`). Service-role key only if genuinely needed server-side (prefer not on request paths).
- Confirm the production Supabase project has `schema.sql` applied and is **not paused**.
- Production smoke test against `SPEC §15` (the subset that shipped).
- Hand the live URL + repo URL to `D1`.
- Confirm the commit history is incremental (each PRD's commit boundary landed as it was built).

## Scope — Explicitly Out
- ❌ CI/CD pipelines, preview-env automation, custom domains → out of scope for the demo.
- ❌ Writing the README → `D1` (D2 only supplies URLs).
- ❌ Production job queue / worker infra → out (`SPEC §13`); batch stays synchronous.
- ❌ Secrets rotation, observability stack → out.

## Dependencies
- A1–C2 (whatever shipped) — the app being deployed.
- A production Supabase project with `schema.sql` applied (from `A1`).
- `D1` — pairs with this PRD (URLs flow D2 → D1).

## Interfaces & Contracts
N/A (ops). Deliverables: a live URL + a green production build + env parity with `.env.example`.

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Supabase free tier paused | resume before demo; document the step (already in README) | `SPEC §11` |
| Missing prod env var | build/runtime fails fast; verify every `.env.example` key is set in Vercel | `SPEC §11` |
| Server/client env leakage | only `NEXT_PUBLIC_*` exposed to client; service-role never shipped to browser | `SPEC §10` |
| Streaming on serverless | confirm the chat route streams on Vercel's runtime (verify route runtime config) | `SPEC §2` |

## Reuse
- `.env.example` (from A1) — the exact key list to mirror in Vercel.
- `schema.sql` — already applied to the prod project in A1.
- README "Running it locally" + paused-project note — adapt for prod.

## Acceptance criteria
- [ ] App is deployed to a public Vercel URL and loads. (`§15`)
- [ ] Sign up → empty state → upload sample CSV → import summary works **in production**. (`§15`)
- [ ] A spending question returns a correct, fast answer in production. (`§15`)
- [ ] Repo is public with an incremental commit history. (`§15`, brief §6)
- [ ] Every `.env.example` key has a value set in Vercel.

## Verification
1. Deploy; open the live URL; run the `SPEC §15` smoke path (signup → ingest → ask a question →
   whichever of receipts/budget/subscriptions shipped).
2. `git log --oneline` → commits map to PRD boundaries (incremental progress visible).
3. Confirm in Vercel dashboard that all env vars are present; client bundle contains no secret keys.

## Commit / PR boundary
- (ops, not code) — final commit if any prod config files: `chore(deploy): vercel config + env notes`

## Assumptions / Open questions
- Single production Supabase project doubles as the demo DB — acceptable for the assessment.
- If behind on time, deploy whatever subset works; D1 marks the rest honestly.
