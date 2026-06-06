import "server-only";
import { getServerClient } from "@/lib/db/client";
import { categorize } from "./categorize";
import { recomputeRollups } from "./rollups";
import { detectSubscriptions } from "./subscriptions";
import { scoreAnomalies } from "./anomalies";

export interface BatchResult {
  rollups: number;
  subscriptions: number;
  anomalies: number;
  categorized: number;
}

/**
 * Single entrypoint the ingest pipeline (A2) and receipt confirm (C1) call
 * after inserting rows. Runs the precompute jobs synchronously for the demo;
 * each job is idempotent and scoped to one user (SPEC §7). Production path
 * (a worker/queue) is described in the README, not built (SPEC §13).
 *
 * Order matters: categorize first so rollups/anomalies bucket by final category.
 */
export async function runBatchForUser(
  userId: string,
  opts?: { affectedMonths?: string[] },
): Promise<BatchResult> {
  const supabase = await getServerClient();

  const categorized = await categorize(supabase, userId);
  const rollups = await recomputeRollups(supabase, userId, opts?.affectedMonths);
  const subscriptions = await detectSubscriptions(supabase, userId);
  const anomalies = await scoreAnomalies(supabase, userId);

  return { categorized, rollups, subscriptions, anomalies };
}
