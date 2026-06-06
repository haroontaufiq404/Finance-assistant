# PRD-D1 — README / Design Note

| | |
|---|---|
| **ID** | `D1` |
| **Epic** | D — Delivery |
| **SPEC §12 window** | 5:30–6:00 |
| **Status** | `todo` |
| **Est. effort** | 20–30 min |
| **Cuttable?** | no — **graded as heavily as the code** (`SPEC §14`, brief §6) |

---

## Context
The write-up is a required deliverable that **must live in the repo** (brief §6) and is graded as
heavily as the code (`SPEC §14`). `README.md` already exists as a strong skeleton with `TODO`
markers; this PRD's job is to make it **honest and complete** — reflect what actually shipped vs was
stubbed vs skipped, fill the placeholders, and ensure setup instructions actually work. "A narrow
slice that works beats broad and broken" — say so plainly.

## Scope — In
- Fill every `TODO` in `README.md`:
  - Live demo + repo URLs (line 5) — from `D2`.
  - **What's built** table (lines 46–58) — set each status `✅/🟡/⛔` to **reality**; one honest line each.
  - Architecture diagrams note (line 22) — keep the ASCII diagram or add images.
  - Assumptions (line 98), intentional cuts (line 110), Challenges (lines 114–119) — fill from what
    happened, including assumptions recorded across the PRDs' "Assumptions / Open questions".
- Confirm the README covers all 8 points of `SPEC §14`: built/stubbed/skipped + why, the thesis, the
  two planes + tiered router, decisions+trade-offs, cost story, scale story, evolution paths, challenges.
- Verify "Running it locally" (lines 123–148) matches the actual commands, env keys (`.env.example`),
  and the schema-apply step; keep the paused-free-tier note.

## Scope — Explicitly Out
- ❌ Re-deriving architecture from scratch → it's already written in README + `SPEC §1`; this PRD
  *updates to reality*, not rewrites.
- ❌ Deploy itself / obtaining the live URL → `D2` (D1 consumes the URL).
- ❌ Editing `SPEC.md` / `UI_SPEC.md`.

## Dependencies
- All build PRDs (A1–C2) — their final state determines the honest status table.
- `D2` — supplies the live demo + repo URLs (D1 can be written before, URLs slotted after deploy).

## Interfaces & Contracts
N/A (documentation). The "contract" is `SPEC §14`'s 8 required topics + the brief's documentation
requirements (features covered, decisions+why, assumptions/trade-offs/limits, what was
skipped/stubbed/simplified, challenges).

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| A feature was cut (e.g. merchant lookup) | mark `⛔`, say why + where the seam is — don't pretend | `SPEC §13/§14` |
| A feature is partial | mark `🟡` and state exactly what works vs not | brief §6 honesty |
| An assumption was made during build | write it down (brief §8: "write it down rather than ask") | brief §8 |

## Reuse
- The existing `README.md` (it's ~90% written) — fill, don't restart.
- Each PRD's "Assumptions / Open questions" + "Acceptance criteria" → source material for the
  assumptions/cuts/status sections.
- `SPEC §13` non-goals → the "intentionally skipped" list; `SPEC §14` → the section checklist.

## Acceptance criteria
- [ ] Zero `TODO` markers remain in `README.md`.
- [ ] The What's-built table reflects reality (no feature marked ✅ that doesn't work end-to-end).
- [ ] All 8 `SPEC §14` topics are present.
- [ ] Setup instructions, followed verbatim on a clean machine, bring the app up.
- [ ] Live demo + repo URLs present.

## Verification
1. `grep -n "TODO" README.md` → no matches.
2. Cross-check the status table against each PRD's acceptance state (the INDEX board).
3. Dry-run the "Running it locally" steps mentally/literally against `.env.example` + `schema.sql`.

## Commit / PR boundary
- `docs: finalize design note — honest status, decisions, cost/scale, challenges`

## Assumptions / Open questions
- Diagrams: ASCII (already in README) is acceptable; images optional if time allows.
