import "server-only";

export interface BatchResult {
  rollups: number;
  subscriptions: number;
  anomalies: number;
  categorized: number;
}

/**
 * Single entrypoint the ingest pipeline calls after inserting rows. The real
 * precompute jobs (categorize, rollups, subscriptions, anomalies) are
 * implemented in PRD-A3; until then this is a no-op so ingest works end-to-end.
 *
 * TODO(A3): wire the four batch jobs here.
 */
export async function runBatchForUser(
  _userId: string,
  _opts?: { affectedMonths?: string[] },
): Promise<BatchResult> {
  return { rollups: 0, subscriptions: 0, anomalies: 0, categorized: 0 };
}
