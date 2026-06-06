import "server-only";
import { getServerClient } from "@/lib/db/client";
import type { UserMemoryRule } from "@/lib/contracts";

export interface LoadedMemory {
  /** Compact summary injected into the orchestrator system prompt. */
  promptSummary: string;
  /** Budget exclusion rules applied deterministically in the budget query. */
  budgetExclusions: { category: string; from: string }[];
}

interface MemoryRow {
  kind: string;
  type: string;
  params: Record<string, unknown>;
  text: string | null;
}

/**
 * Reads the user's deterministic memory (PRD-B3, SPEC §5). Returns a compact
 * prompt summary (so facts like "paid on the 1st" apply without a tool round-
 * trip) and structured budget exclusions the budget query enforces in code.
 */
export async function loadMemory(userId: string): Promise<LoadedMemory> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("user_memory")
    .select("kind, type, params, text")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`loadMemory failed: ${error.message}`);

  const rows = (data as MemoryRow[] | null) ?? [];
  const budgetExclusions: { category: string; from: string }[] = [];
  const lines: string[] = [];

  for (const row of rows) {
    if (row.type === "exclude_category_from_budget") {
      const exclude = String(row.params.exclude ?? "");
      const from = String(row.params.from ?? "");
      if (exclude && from) {
        budgetExclusions.push({ category: exclude, from });
        lines.push(`Exclude "${exclude}" from the "${from}" budget.`);
      }
    } else if (row.type === "income_day") {
      lines.push(`Gets paid on day ${row.params.day} of the month.`);
    } else if (row.text) {
      lines.push(row.text);
    }
  }

  return { promptSummary: lines.join("\n"), budgetExclusions };
}

/** Human confirmation line for a saved rule (used by the saveMemory tool). */
export function summarizeRule(rule: UserMemoryRule): string {
  switch (rule.type) {
    case "exclude_category_from_budget":
      return `Got it — I'll exclude ${rule.exclude} from your ${rule.from} budget.`;
    case "income_day":
      return `Noted — you're paid on day ${rule.day} of the month.`;
    case "free_text":
      return `Noted — I'll remember that.`;
  }
}
