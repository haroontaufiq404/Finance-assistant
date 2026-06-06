# Personal Finance Assistant — UI / UX Design Spec

> **Purpose.** Design specification to hand to Claude Code alongside `SPEC.md`. It defines the aesthetic direction, design tokens, screen/component inventory, interaction states, and the 6-hour UI scope. Build with **Next.js (App Router) + Tailwind + shadcn/ui + lucide-react**; charts with **Recharts**. Verify shadcn/ui setup against current docs.

---

## 1. Design principles

1. **Chat-first, but never a wall of text.** The assistant is the primary surface. Every tool result renders as a **structured card**, not a paragraph of numbers. A spending answer is a breakdown card; a budget is a progress bar; a receipt is an editable draft. Prose narrates *around* the card, it doesn't replace it. This is the product's signature.
2. **Trust through precision.** It's a money app. Numbers are right-aligned, use tabular figures, and never jitter while streaming. Calm beats clever. No dark patterns, no anxiety-inducing red unless something is genuinely wrong.
3. **Speed must be felt.** Tier-0 answers should appear near-instant. Use optimistic UI for mutations (setting a budget), skeletons for in-flight cards, and stream narration token-by-token so the user sees motion immediately.
4. **Honesty in the UI.** Low-confidence receipt extractions show a confirm step. "I couldn't determine this" is a first-class state with its own treatment, not an error toast.

---

## 2. Aesthetic direction — "quiet ledger"

Refined, editorial, restrained — the calm confidence of a private-banking statement crossed with a clean reading experience. Minimalism executed with precision, not emptiness. **Explicitly avoid** generic AI aesthetics: no purple-on-white gradients, no Inter/Roboto, no glassmorphism.

- **Mood:** composed, precise, a little editorial. Lots of air. One confident accent.
- **One memorable detail:** money is set in a slightly oversized, tabular display face with a hairline rule beneath section totals — the page reads like a beautifully typeset statement.

### 2.1 Color tokens (CSS variables; light primary, dark supported)

```css
:root {
  --bg:            #FBFAF7;  /* warm paper, not stark white */
  --surface:       #FFFFFF;  /* cards */
  --surface-sunk:  #F3F1EB;  /* inset / skeleton */
  --border:        #E7E3DA;  /* hairline */
  --text:          #1C1B19;  /* near-black, warm */
  --text-muted:    #6B6860;
  --text-faint:    #9A968C;
  --accent:        #1E5B4F;  /* deep evergreen — trustworthy, not corporate-blue */
  --accent-soft:   #E4EFEA;  /* accent wash for chips/active */
  --income:        #2E6F4E;  /* positive money */
  --spend:         #1C1B19;  /* spend renders as plain text, not alarming */
  --warn:          #B5791F;  /* budget nearing limit */
  --danger:        #A33A2B;  /* over budget / true alerts */
  --radius:        12px;
  --radius-sm:     8px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:#14130F; --surface:#1C1B17; --surface-sunk:#222018; --border:#322F27;
    --text:#F2EFE6; --text-muted:#A8A498; --text-faint:#76726A;
    --accent:#5BAE97; --accent-soft:#1E2C28;
    --income:#7CC79E; --warn:#D8A24A; --danger:#D9745F;
  }
}
```

> Accent is deliberately evergreen, not blue or purple. If a different intentional palette is chosen, keep the rule: one dominant neutral base, one confident accent, semantic colors reserved for money state only.

### 2.2 Typography

- **Display / numbers:** a characterful but legible face with true tabular numerals — e.g. *Fraunces* (display) or *Spline Sans* for a modern grotesque; pair must include `font-feature-settings: "tnum" 1`. Used for money amounts, totals, headings.
- **Body / UI:** a clean humanist sans that is *not* Inter — e.g. *Spline Sans*, *Hanken Grotesk*, or *Public Sans*. 16px base, 1.6 line-height.
- **Money rule:** always tabular numerals, right-aligned in any column, two decimals, with the currency symbol set in `--text-muted`. Negative spend is shown without a minus where context is clear (a "spending" card); income is prefixed `+` in `--income`.
- **Scale:** 13 / 14 / 16 / 20 / 28 / 40. Headings weight 500–600, body 400. No ALL CAPS except tiny eyebrow labels with letter-spacing.

### 2.3 Spacing, elevation, motion

- 8px spatial grid. Card padding 20–24px. Generous gaps between message turns (24–32px).
- Elevation is restrained: cards use a 1px `--border` hairline + a barely-there shadow, not heavy drop shadows.
- Motion: subtle. Card entrance = 8px rise + fade, 180ms ease-out, staggered for lists. Number changes count up over ~400ms. Respect `prefers-reduced-motion`. No bouncy springs.

---

## 3. Information architecture

Two routes plus auth. Deliberately not a dashboard-first app — the chat is the product.

```
/login              Auth (Supabase)
/chat               App shell: sidebar + chat thread (default after login)
                    (empty/onboarding state lives inside /chat)
```

### App shell layout (`/chat`)

```
┌───────────────┬──────────────────────────────────────────────┐
│  SIDEBAR      │  HEADER (thin): account · upload · new chat    │
│  (240px)      ├──────────────────────────────────────────────┤
│  · New chat   │                                                │
│  · Recent     │   CHAT THREAD (max-width ~760px, centered)     │
│    convos     │   — user + assistant turns                     │
│               │   — assistant turns may contain result cards   │
│  ─────────    │                                                │
│  Quick facts: │                                                │
│  · This month │                                                │
│    spend      │                                                │
│  · Budgets    ├──────────────────────────────────────────────┤
│  · Alerts (n) │  COMPOSER: text input · attach (receipt) · send│
└───────────────┴──────────────────────────────────────────────┘
```

The sidebar's "Quick facts" are *read-only glances* (this month's spend, budget status, unread anomaly count) that deep-link into a chat query when clicked (e.g. clicking "Alerts (3)" sends "show me my unusual activity"). They reuse the same tools — no separate data path.

On mobile: sidebar collapses to a sheet; thread is full-width; composer pinned to bottom.

---

## 4. Component inventory

shadcn/ui primitives to lean on: `button`, `input`, `card`, `sheet`, `dialog`, `badge`, `progress`, `skeleton`, `tooltip`, `scroll-area`, `avatar`, `separator`, `sonner` (toasts).

### 4.1 Chat thread

- **User turn:** right-aligned, `--surface-sunk` bubble, no avatar needed; image attachments show a thumbnail.
- **Assistant turn:** left-aligned, no bubble — flows as text on `--bg` (editorial feel), with result cards inset full-width of the thread column. Streaming text shows a soft caret.
- **Tool-running indicator:** between the user turn and the answer, a slim inline status — e.g. "Looking up that charge…" with a 3-dot shimmer — replaced by the result when ready. Keep it under the answer's eventual position so layout doesn't jump.

### 4.2 Composer

- Single-line growing textarea, Enter to send / Shift+Enter newline.
- Attach button (paperclip) → image picker for receipts; selected image shows a removable chip above the input.
- Send disabled while empty or while a turn is streaming. Show a stop button during stream.

### 4.3 Result cards (the heart — build these to feel designed)

Each maps to a tool output (`SPEC.md` §5.1). Shared shell: `--surface`, hairline border, `--radius`, 20px padding, optional eyebrow label + title row.

| Card | Trigger tool | Contents |
|---|---|---|
| **SpendingBreakdownCard** | `getSpending` | Big total in display face; a compact horizontal bar or top-N category list with amounts right-aligned; period label. Hairline rule above the total. |
| **TransactionListCard** | `getTransactions` | Tight rows: date · merchant · category badge · amount (right). Max ~10 visible, "show more" expands. |
| **TrendCard** | `getTrend` | Small Recharts line/bar of monthly totals; this-month vs typical with a delta chip (`+18% vs your average`); delta colored only if notable. |
| **SubscriptionsCard** | `getSubscriptions` | List of recurring charges: merchant · cadence · amount · next expected date; a "dismiss" affordance per row. |
| **AnomalyAlertCard** | `getAnomalies` | One row per flag with a plain-language reason; restrained — `--warn`/`--danger` accent stripe only, not a full red card; "looks fine / not me" actions. |
| **BudgetStatusCard** | `getBudgetStatus` / `setBudget` | `progress` bar: spent vs limit, % used, remaining. Bar turns `--warn` ≥ 80%, `--danger` ≥ 100%. Shows applied exclusions ("excluding rent") as a faint note. |
| **MerchantLookupCard** | `lookupMerchant` | Likely merchant identity, a one-line description, and a **source link**; an explicit "couldn't determine" state if search was inconclusive. |
| **ReceiptDraftCard** | receipt flow | Editable fields (merchant, date, total, category); a confidence indicator; **Confirm** / **Discard**. Low-confidence fields are highlighted for review. See §5.2. |
| **SummaryCard** | `summarizeFinances` | Short prose summary + 2–3 headline stats in a small stat row. |
| **CutbacksCard** | `suggestCutbacks` | Ranked suggestions, each with a concrete number ("Cancel X → save $Y/mo") and a one-tap "set a budget for this". |
| **ClarificationChips** | `askClarification` | The assistant's question rendered as text + 2–4 quick-reply chips that send the answer on tap. |

> Cards are presentation only. They receive typed props derived from tool output; they never fetch. Keep a `<ResultCard kind="…" data={…}/>` switch so new cards are additive.

### 4.4 Empty / onboarding state (inside `/chat`)

First login, no transactions: a calm centered panel — short welcome, an **Upload transactions (CSV)** dropzone, and 3 example prompt chips ("How much did I spend last month?", "Find my subscriptions", "Am I spending more than usual?"). After a successful import, show the import summary (`imported / skipped / reasons`) as a system card, then reveal the composer.

### 4.5 Import summary card

Non-negotiable per the edge-case requirements: after CSV ingest, show `{imported} added · {skipped} skipped`, with an expandable list of skip reasons. Skipped rows are surfaced, never silently dropped.

---

## 5. Key interaction flows

### 5.1 Asking a question (Tier 0/1)
User sends → optimistic user turn appears → inline tool-running shimmer → result card + streamed narration. Target: card visible in well under a couple of seconds. If the model asks for clarification instead, render `ClarificationChips`.

### 5.2 Receipt upload (confidence-gated)
Attach image → send (optionally with a note) → user turn shows thumbnail → "Reading your receipt…" shimmer → **ReceiptDraftCard**. If confidence ≥ threshold and fields complete, the card is pre-confirmed-looking but still requires one **Confirm** tap (never auto-record). If low confidence, the card opens in review mode with flagged fields focused. On Confirm → optimistic "added" + the new transaction reflected in any open budget glance.

### 5.3 Setting a budget
"Budget $400 for dining" → `setBudget` → optimistic **BudgetStatusCard** rendered immediately, reconciled on server response. Sidebar budget glance updates.

### 5.4 Remembered context
"Don't count rent in my food budget" → `saveMemory` → assistant confirms in one line ("Got it — I'll exclude rent from your food budget"). Next BudgetStatusCard shows the exclusion note. This visibly proves the memory feature.

---

## 6. States to design for every data surface

- **Loading:** skeletons matched to the card's final shape (not spinners).
- **Empty:** purposeful copy + the next action, never a blank card.
- **Error:** inline, calm, retry affordance; reserve toasts for transient mutations.
- **Inconclusive:** the honest "couldn't determine / not enough data" treatment — distinct from error.
- **Streaming:** text caret; numbers don't appear until final to avoid jitter.

---

## 7. Accessibility & responsiveness

- WCAG AA contrast on all text (the warm-paper bg is chosen to still pass). Don't encode meaning in color alone — pair budget state color with a label and the % value.
- Full keyboard path: send, attach, confirm/discard receipt, quick-reply chips, dismiss alert.
- Respect `prefers-reduced-motion` (disable count-ups and rises).
- Mobile: single column, sidebar in a sheet, composer pinned, cards full-width with comfortable tap targets (≥44px).

---

## 8. UI build scope for 6 hours

**Build (in order):**
1. App shell + auth screen + empty/onboarding with CSV dropzone + import summary card.
2. Chat thread + composer + streaming + the `<ResultCard>` switch.
3. The 3–4 highest-value cards: **SpendingBreakdownCard**, **BudgetStatusCard**, **TrendCard**, **ReceiptDraftCard**.
4. **AnomalyAlertCard** / **SubscriptionsCard** / **MerchantLookupCard** as time allows.

**Stub / simplify (note in README):**
- ClarificationChips can fall back to plain text questions.
- TransactionListCard can be a simple list before any polish.
- Sidebar "Quick facts" can be static-on-load (no live refresh) for the demo.
- Skip multi-conversation management polish; one active conversation is fine.
- Dark mode tokens are defined; wiring the toggle is optional.

**Don't skip:** the import summary (skipped-rows visibility), the receipt confirm step (confidence gating), and the budget exclusion note (proves remembered context). These three are where edge-case and product judgment are graded — they're cheap to build and high-signal.

---

## 9. Definition of done (UI)

- Auth → empty state → upload CSV → import summary renders with skip reasons.
- A spending question renders a SpendingBreakdownCard with correct, right-aligned tabular money and streamed narration, fast.
- A receipt upload produces an editable draft requiring explicit Confirm; low confidence opens in review mode.
- Setting a budget renders a BudgetStatusCard that turns warn/danger at the right thresholds and shows any exclusion note.
- All cards have loading skeletons and a sensible empty/inconclusive state.
- Layout holds on mobile; no horizontal scroll; reduced-motion respected.
