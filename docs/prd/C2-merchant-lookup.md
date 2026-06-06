# PRD-C2 — Merchant Lookup (Tier 3, agentic web)

| | |
|---|---|
| **ID** | `C2` |
| **Epic** | C — Multimodal / outside-the-system |
| **SPEC §12 window** | 5:00–5:30 |
| **Status** | `todo` |
| **Est. effort** | 30 min |
| **Cuttable?** | yes — **cut #1** (highest effort-to-DoD ratio) |

---

## Context
The agentic-reasoning signal (`SPEC §5.1`, §9) and the cleanest demonstration of the adaptability
story: **a new capability = one new tool + one routing line**, plugged into B1's existing tool
boundary. When a user doesn't recognize a charge, `lookupMerchant` runs its own small loop — search
the web, read top results, have `REASONING_MODEL` summarize the likely merchant identity — and on no
result returns an honest "could not determine" rather than hallucinating. This is a Tier-3, rare,
heavier call by design (`SPEC §1` tiered effort).

## Scope — In
- `/lib/search/web.ts` — single adapter over Tavily (or Exa); one function, provider behind an env
  key (`TAVILY_API_KEY`). Rare calls only.
- `lookupMerchant` tool (registered into `B1`'s `buildToolSet`): input `{ merchantName }`; internal
  loop: `web.search` → read top results → `REASONING_MODEL` summarizes likely identity + a source
  link; returns identity + one-line description + source, or an explicit `couldNotDetermine` result.
- Merchant prompt in `/lib/agent/prompts.ts` (the stub left by B1).

## Scope — Explicitly Out
- ❌ The `MerchantLookupCard` UI (incl. "couldn't determine" state) → `B2`.
- ❌ Caching/persisting merchant identities → not needed for the demo (note as evolution path).
- ❌ General web browsing for other tools → the adapter is scoped to merchant lookup.
- ❌ Model resolution → `B1` `models.ts` (`reasoningModel()`).
- ❌ Defining the tool I/O schema → `00-contracts`.

## Dependencies
- `00-contracts` — `lookupMerchant` input/output schema.
- `B1` — `buildToolSet` extension point + `reasoningModel()` + the merchant prompt slot.
- `TAVILY_API_KEY` from `A1`'s `.env.example`.

## Interfaces & Contracts
```ts
// /lib/search/web.ts
export async function webSearch(query: string, opts?: { topK?: number }):
  Promise<{ title: string; url: string; snippet: string }[]>;

// lookupMerchant tool output (00-contracts)
//   { merchant: string; description: string; sourceUrl: string } | { couldNotDetermine: true }
```

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Search returns nothing relevant | return `couldNotDetermine` — **no hallucinated identity** | `§9`, `SPEC §5.1` |
| Search provider errors / times out | degrade to `couldNotDetermine`; don't crash the turn | robustness |
| Cost discipline | Tier-3, invoked only when the router judges it needed; not on every charge | `SPEC §1` |
| Ambiguous merchant string (e.g. "SQ *XYZ") | summarize best guess WITH a source; flag uncertainty | `§9` |

## Reuse
- `SPEC §5.1` `lookupMerchant` row (tier 3, agentic) + the "no result → couldn't determine" rule.
- `B1` `reasoningModel()`; the tool-set extension pattern (`new tool + one routing line`).
- Tavily/Exa SDK (`SPEC §2`, build-vs-buy).

## Acceptance criteria
- [ ] An unknown-merchant query triggers `lookupMerchant` and returns a **sourced** guess. (`§15`)
- [ ] When inconclusive, it returns an honest "couldn't determine" — never a fabricated identity. (`§15`, `§9`)
- [ ] Adding this tool required only a new tool def + registration (no orchestrator surgery) — proves
      the adaptability story. (`SPEC §9`)

## Verification
1. `pnpm dev`: ask "what is this charge from <real merchant>?" → MerchantLookupCard with a source link.
2. Ask about a nonsense merchant string → honest "couldn't determine" state.
3. Temporarily unset `TAVILY_API_KEY` → graceful `couldNotDetermine`, no crash.

## Commit / PR boundary
- `feat(search): tavily/exa web adapter behind one interface`
- `feat(agent): agentic lookupMerchant tool (search → read → reasoning summary)`

## Assumptions / Open questions
- Tavily as default provider unless Exa is faster to wire (`SPEC §2`) — record choice.
- No persistence/caching of results for the demo — named as an evolution path in README.
