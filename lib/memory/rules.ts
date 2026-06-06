import "server-only";

export interface LoadedMemory {
  /** Compact summary injected into the orchestrator system prompt. */
  promptSummary: string;
  /** Budget exclusion rules applied in the budget query layer. */
  budgetExclusions: { category: string; from: string }[];
}

/**
 * Reads the user's deterministic memory (rules + facts) and returns a compact
 * prompt summary plus structured budget exclusions.
 *
 * Fully implemented in PRD-B3. Until then this is a no-op so the orchestrator
 * (B1) builds and runs without the memory feature wired.
 */
export async function loadMemory(_userId: string): Promise<LoadedMemory> {
  return { promptSummary: "", budgetExclusions: [] };
}
