# PRD-C1 — Receipt OCR (Tier 2): Vision → Confidence Gate → Confirm

| | |
|---|---|
| **ID** | `C1` |
| **Epic** | C — Multimodal |
| **SPEC §12 window** | 4:00–5:00 |
| **Status** | `todo` |
| **Est. effort** | 60 min |
| **Cuttable?** | yes — **cut #3** (after merchant-lookup, anomalies) |

---

## Context
The multimodal + failure-handling signal (`SPEC §8`, §9). A receipt image is stored, sent to
`VISION_MODEL` for **structured** extraction (validated by Zod), and gated on confidence: low
confidence or missing required fields → a **draft the user must confirm** — never silently record a
wrong amount. Confirming inserts a linked `transaction(source='receipt')` and triggers rollups. The
honesty of the confidence gate is the graded part, not OCR accuracy.

## Scope — In
- `/api/receipts/route.ts` — `POST` image → upload to Supabase Storage (`receipts` bucket, path
  `{user_id}/{receipt_id}.{ext}`) → insert `receipts` row (`status='pending'`) → call `VISION_MODEL`
  with a structured-extraction prompt → parse into `ReceiptExtraction` (`00-contracts`) → return a
  **draft** (always requires confirm) with per-field confidence.
- `/api/receipts/confirm/route.ts` — `POST` confirmed/corrected fields → insert `transactions`
  (`source='receipt'`), set `receipts.linked_transaction_id` + `status='confirmed'`, trigger
  `runBatchForUser` for the affected month.
- Confidence-gate logic: overall `< 0.7` or required field missing → draft opens in review mode
  (flagged fields); manual-entry fallback prefilled with whatever was extracted.
- Near-duplicate detection on confirm: match candidate against existing `transactions` by
  date+amount+merchant_norm → surface conflict instead of double-counting.

## Scope — Explicitly Out
- ❌ The `ReceiptDraftCard` UI → `B2` (C1 returns the draft payload it renders).
- ❌ Defining `ReceiptExtraction` shape → `00-contracts`.
- ❌ Model resolution (`visionModel()`) → `B1` `models.ts` (C1 calls it).
- ❌ Batch recompute internals → `A3` (C1 only invokes `runBatchForUser`).
- ❌ Training/tuning an OCR model → use the hosted vision model (build-vs-buy, `SPEC §7`).

## Dependencies
- `00-contracts` — `ReceiptExtraction` schema.
- `A1` — `getCurrentUser()`, `getServerClient()`, Storage access; `receipts` bucket + RLS exist in
  `schema.sql`.
- `A3` — `runBatchForUser` (triggered on confirm).
- `B1` — `visionModel()`.

## Interfaces & Contracts
```ts
// POST /api/receipts        (multipart: image[, note])
//   200 -> { receiptId, draft: ReceiptExtraction, requiresConfirm: true, lowConfidenceFields: string[] }
// POST /api/receipts/confirm ({ receiptId, fields: ReceiptExtraction, resolveConflict?: 'keep'|'merge' })
//   200 -> { transactionId, conflict?: { existingTransactionId } }
```
Draft payload feeds `B2`'s `ReceiptDraftCard`; confirm returns the linked transaction id.

## Edge cases
| Situation | Required behavior | Ref |
|---|---|---|
| Blurry receipt | confidence gate catches low quality → review-mode confirm | `§9` |
| Rotated / foreign language | instruct vision model to handle rotation + language | `§9`, `SPEC §8` |
| Partly cut off / missing total | required field missing → draft + manual fallback prefilled | `§9`, `SPEC §8` |
| High confidence + complete | still requires one explicit Confirm (never auto-record) | `SPEC §8`, `UI_SPEC §5.2` |
| Receipt duplicates an existing bank txn | match date+amount+merchant; surface conflict, don't double-count | `§9` contradicting sources |
| Vision call fails entirely | fall back to manual entry fields; don't crash | `SPEC §8` |

## Reuse
- `schema.sql`: `receipts` table (176–187), the private `receipts` bucket + path-scoped storage RLS
  (254–267) — confirm uploads follow the `{user_id}/...` convention.
- `00-contracts` `ReceiptExtraction` + `coerceAmountToCents`/`coerceDate` for parsing extracted values.
- `B1` `visionModel()`; `A3` `runBatchForUser`.

## Acceptance criteria
- [ ] A receipt photo produces an extracted draft. (`§15`)
- [ ] Low confidence triggers a confirm step (review mode). (`§15`)
- [ ] Confirming creates a linked `transaction(source='receipt')` and updates `receipts`. (`§15`)
- [ ] A receipt matching an existing bank txn surfaces a conflict, not a duplicate. (`§9`)
- [ ] Confirmed receipt's month is reflected in rollups (budget glance updates). (`SPEC §8`)

## Verification
1. `pnpm dev`: upload a clear receipt → draft → Confirm → new transaction appears; budget/spend
   reflects it.
2. Upload a blurry/rotated receipt → opens in review mode with flagged fields.
3. Upload a receipt matching a seeded bank txn (same date/amount/merchant) → conflict surfaced.
4. Supabase MCP: confirm `receipts.status='confirmed'` + `linked_transaction_id` set; object exists
   in the `receipts` bucket under the user's folder.

## Commit / PR boundary
- `feat(receipts): upload + vision structured extraction + confidence gate (draft)`
- `feat(receipts): confirm endpoint → linked transaction + rollup trigger`
- `feat(receipts): near-duplicate conflict detection`

## Assumptions / Open questions
- Confidence threshold 0.7 (`SPEC §8`) — record if tuned.
- Per-field vs overall confidence: ship overall; flag obviously-missing fields. Note in README.
