# PRD-B2 — Chat UI · Streaming · Result Cards

| | |
|---|---|
| **ID** | `B2` |
| **Epic** | B — Agent plane |
| **SPEC §12 window** | 2:30–4:00 (parallel with B1/B3) |
| **Status** | `todo` |
| **Est. effort** | 90 min |
| **Cuttable?** | partial — card polish is cuttable; the 3 high-signal notes are not |

---

## Context
The product is chat-first, but **every tool result renders as a structured card, not a wall of
numbers** — that's the signature (`UI_SPEC §1`). This PRD builds the app shell, the streaming chat
thread, and the `<ResultCard>` switch that turns typed tool output (`ResultCardData` from
`00-contracts`) into designed cards. The "quiet ledger" aesthetic (`UI_SPEC §2`) and tabular,
non-jittering money (`UI_SPEC §2.2`) are the trust signal.

## Scope — In
- `/app/chat/page.tsx` — app shell per `UI_SPEC §3`: sidebar (new chat, recent, read-only Quick
  facts), thin header (account · upload · new chat), centered thread, composer.
- `/components/*`:
  - Chat thread + turns (`UI_SPEC §4.1`), composer with attach (`§4.2`), streaming renderer with
    soft caret + tool-running shimmer.
  - `<ResultCard kind=… data=…/>` switch (`UI_SPEC §4.3`) — additive by design.
  - Empty/onboarding state with CSV dropzone + example chips (`§4.4`); **import-summary card** (`§4.5`).
  - Cards, in `UI_SPEC §8` priority: **SpendingBreakdown, BudgetStatus, Trend, ReceiptDraft** first;
    then Anomaly / Subscriptions / MerchantLookup / Summary / Cutbacks / ClarificationChips as time
    allows.
- Design tokens (`UI_SPEC §2.1`) + typography (`§2.2`); skeleton/empty/error/inconclusive/streaming
  states (`§6`); responsive + reduced-motion (`§7`).

## Scope — Explicitly Out
- ❌ Any data fetching inside cards → cards are **presentation only**, receive typed props, never
  fetch (`UI_SPEC §4.3`).
- ❌ Tool/orchestrator/stream-producing logic → `B1` (B2 *consumes* the stream).
- ❌ Receipt extraction / merchant search logic → `C1`/`C2` (B2 renders their card outputs).
- ❌ Multi-conversation management polish, dark-mode toggle wiring → simplify/skip (`UI_SPEC §8`).
- ❌ Live-refreshing sidebar Quick facts → static-on-load is fine for the demo (`UI_SPEC §8`).

## Dependencies
- `00-contracts` — `ResultCardData` union + chat message shapes (the props cards receive).
- `B1` — the `/api/chat` stream contract (narration tokens + typed tool results).
- `A2` — `/api/ingest` returning `IngestSummary` (the import-summary card binds to it).

## Interfaces & Contracts
```tsx
// presentation only — no fetching
function ResultCard(props: { kind: ResultCardData["kind"]; data: ResultCardData }): JSX.Element;
// consumes B1 stream via the AI SDK React hook (verify useChat/streaming API at install)
```
B2 binds to B1's stream and to `IngestSummary`/`ResultCardData` from `00-contracts` — no shape is
defined here.

## Edge cases (UI states — `UI_SPEC §6`)
| Situation | Required behavior | Ref |
|---|---|---|
| Tool in flight | skeleton matched to final card shape + inline "Looking up…" shimmer; layout doesn't jump | `§4.1`, `§6` |
| Streaming numbers | text streams; **numbers appear only when final** (no jitter) | `§2.2`, `§6` |
| Low-confidence receipt | `ReceiptDraftCard` opens in review mode, flagged fields focused; **explicit Confirm** | `§5.2` |
| "Couldn't determine" (merchant / no data) | first-class inconclusive treatment, not an error toast | `§1`, `§6` |
| Clarification needed | `ClarificationChips` (fallback: plain-text question) | `§4.3`, `§8` |
| Skipped CSV rows | import-summary card shows `N added · M skipped` + expandable reasons | `§4.5` |
| Mobile | single column, sidebar→sheet, composer pinned, cards full-width, ≥44px targets | `§7` |

## Reuse
- `UI_SPEC` end-to-end (tokens §2.1, type §2.2, layout §3, component table §4.3, flows §5, states §6).
- shadcn/ui primitives (`UI_SPEC §4`): `card`, `progress`, `skeleton`, `badge`, `sheet`, `dialog`,
  `sonner`, etc.; `lucide-react`; Recharts for `TrendCard`.
- `A2` import-summary shape; `B1` stream.

## Acceptance criteria
- [ ] Auth → empty state → upload CSV → import summary renders with skip reasons. (`UI_SPEC §9`)
- [ ] A spending question renders `SpendingBreakdownCard` with right-aligned tabular money + streamed
      narration, fast. (`UI_SPEC §9`)
- [ ] Receipt upload → editable draft requiring explicit Confirm; low confidence opens review mode.
      (`UI_SPEC §9`, depends on C1 output)
- [ ] `BudgetStatusCard` turns warn ≥80% / danger ≥100% and shows any exclusion note. (`UI_SPEC §9`)
- [ ] All cards have loading skeletons + sensible empty/inconclusive states. (`UI_SPEC §9`)
- [ ] Mobile holds; no horizontal scroll; reduced-motion respected. (`UI_SPEC §9`)

## Verification
1. `pnpm dev` → walk `UI_SPEC §9` checklist manually.
2. Resize to mobile width → no horizontal scroll; sidebar collapses to sheet.
3. Toggle OS reduced-motion → count-ups / rises disabled.
4. (Optional) Playwright **MCP**: snapshot the empty state and a spending answer.

## Commit / PR boundary
- `feat(ui): app shell + auth-gated chat layout + tokens/typography`
- `feat(ui): streaming thread + composer + ResultCard switch`
- `feat(ui): onboarding CSV dropzone + import-summary card`
- `feat(ui): SpendingBreakdown/Budget/Trend/ReceiptDraft cards`

## Assumptions / Open questions
- Exact fonts (Fraunces/Spline Sans per `UI_SPEC §2.2`) — pick available web fonts; record choice.
- The 3 non-negotiable notes (`UI_SPEC §8`): import summary, receipt confirm, budget exclusion note —
  these ship even if other card polish is cut.
