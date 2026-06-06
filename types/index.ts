/**
 * Shared TypeScript types for the app (SPEC §3 /types). These mirror the Zod
 * contracts via z.infer; import from here (or directly from @/lib/contracts)
 * for cross-module shapes.
 */
export type {
  NormalizedTransaction,
  TransactionRow,
  TransactionSource,
  IngestSummary,
  RawCsvRow,
  UserMemoryRule,
  MemoryKind,
  ReceiptExtraction,
  ReceiptLineItem,
  ReceiptDraft,
  ResultCardData,
  ChatMessage,
  ChatRole,
  ChatRequest,
} from "@/lib/contracts";
