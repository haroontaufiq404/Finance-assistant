# PRD-<ID> — <Title>

> Copy this file to start a new PRD. Keep every section; delete the inline guidance once filled.
> A PRD is a *scoping contract*, not a tutorial — say what to build, what NOT to build, and how to
> prove it. Link to `SPEC.md` / `UI_SPEC.md` sections rather than restating them.

| | |
|---|---|
| **ID** | `<A1 / B2 / …>` |
| **Epic** | `<A Data plane / B Agent plane / C Multimodal / D Delivery>` |
| **Status** | `todo` · `in-progress` · `done` |
| **SPEC §12 window** | `<e.g. 0:30–1:30>` |
| **Est. effort** | `<e.g. 60 min>` |
| **Cuttable?** | `<no (never-cut) / yes — cut order N>` |

---

## Context
*Why this module exists, the problem it solves, and how it serves the thesis (`SPEC §1`: raw rows
don't enter context; route to the cheapest sufficient tool; two planes). 2–4 sentences.*

## Scope — In
*The exact deliverables. List files created/owned and the public functions/endpoints. Be concrete.*
- `path/to/file.ts` — …

## Scope — Explicitly Out
*The guardrail. What looks in-scope but is NOT — cite the downstream PRD that owns it or the
`SPEC §13` non-goal that excludes it. If you're tempted to build it here, this section says don't.*
- ❌ … → owned by `PRD-<x>` / out per `SPEC §13`.

## Dependencies
*Upstream PRDs that must exist first, and the specific contract each provides. Downstream PRDs only.*
- `PRD-<x>` provides `<symbol / table / endpoint>`.

## Interfaces & Contracts
*The integration surface — the part other PRDs bind to. Function signatures, Zod shapes (reference
`00-contracts.md`, don't redefine), API request/response/stream shapes. Keep types here in sync with
`00-contracts.md`; if a new cross-module shape appears, add it THERE first.*
```ts
// signatures / shapes
```

## Edge cases
*Concrete failure modes → required behavior. Map each to a `SPEC §9` row and/or a `UI_SPEC §6` state.*
| Situation | Required behavior | Ref |
|---|---|---|
| … | … | `§9 …` |

## Reuse
*Existing assets to build on so nothing is rebuilt: `schema.sql` tables, `SPEC`/`UI_SPEC` sections,
prior PRDs' utilities, off-the-shelf libs (build-vs-buy per `SPEC §2`).*
- …

## Acceptance criteria
*Checklist mapped to `SPEC §15` (and `UI_SPEC §9` for UI). Each item is independently checkable.*
- [ ] … (`§15: …`)

## Verification
*How to PROVE it works end-to-end: exact commands, unit tests, Supabase MCP checks, manual steps.*
1. …

## Commit / PR boundary
*The commit(s) this PRD produces, in order (honors `SPEC §12` "commit after each").*
- `feat(<scope>): …`

## Assumptions / Open questions
*Defaults chosen without asking — to be recorded in the README per the brief ("write it down").*
- …
