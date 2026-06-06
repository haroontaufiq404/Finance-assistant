import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recurring-charge detection (PRD-A3, SPEC §7). Groups spend by normalized
 * merchant and looks for repeating intervals near weekly/monthly/annual with a
 * stable amount. Needs >=3 occurrences to avoid false positives on sparse data.
 * Idempotent: upsert on (user_id, merchant_norm); status is left untouched so a
 * user's 'dismissed' choice survives a recompute.
 */

interface SpendRow {
  merchant_norm: string;
  amount_cents: number;
  txn_date: string;
}

const CANONICAL_CADENCES = [7, 30, 365];
const MIN_OCCURRENCES = 3;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function median(nums: number[]): number {
  const s = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function nearestCadence(gap: number): { cadence: number; closeness: number } | null {
  let best: { cadence: number; closeness: number } | null = null;
  for (const c of CANONICAL_CADENCES) {
    const tolerance = c * 0.25; // 25% window
    const diff = Math.abs(gap - c);
    if (diff <= tolerance) {
      const closeness = 1 - diff / tolerance;
      if (!best || closeness > best.closeness) best = { cadence: c, closeness };
    }
  }
  return best;
}

export async function detectSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("transactions")
    .select("merchant_norm, amount_cents, txn_date")
    .eq("user_id", userId)
    .lt("amount_cents", 0)
    .not("merchant_norm", "is", null)
    .order("txn_date", { ascending: true });
  if (error) throw new Error(`subscriptions: fetch failed: ${error.message}`);

  const byMerchant = new Map<string, SpendRow[]>();
  for (const row of (data as SpendRow[] | null) ?? []) {
    const list = byMerchant.get(row.merchant_norm) ?? [];
    list.push(row);
    byMerchant.set(row.merchant_norm, list);
  }

  const upserts: Record<string, unknown>[] = [];

  for (const [merchant, txns] of byMerchant) {
    if (txns.length < MIN_OCCURRENCES) continue;

    const gaps: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      gaps.push(daysBetween(txns[i - 1]!.txn_date, txns[i]!.txn_date));
    }
    const medGap = median(gaps);
    const match = nearestCadence(medGap);
    if (!match) continue;

    const amounts = txns.map((t) => Math.abs(t.amount_cents));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((a, b) => a + (b - avg) ** 2, 0) / amounts.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 1; // coefficient of variation
    if (cv > 0.25) continue; // amounts too unstable to be a subscription

    const lastSeen = txns[txns.length - 1]!.txn_date;
    const nextExpected = new Date(Date.parse(lastSeen) + match.cadence * 86_400_000)
      .toISOString()
      .slice(0, 10);

    // Confidence blends interval regularity, amount stability, and sample size.
    const occurrenceBoost = Math.min(1, txns.length / 6);
    const confidence = Number(
      (0.5 * match.closeness + 0.3 * (1 - cv / 0.25) + 0.2 * occurrenceBoost).toFixed(2),
    );

    upserts.push({
      user_id: userId,
      merchant_norm: merchant,
      cadence_days: match.cadence,
      avg_amount_cents: Math.round(avg),
      last_seen: lastSeen,
      next_expected: nextExpected,
      confidence,
    });
  }

  if (upserts.length > 0) {
    const { error: upErr } = await supabase
      .from("subscriptions")
      .upsert(upserts, { onConflict: "user_id,merchant_norm" });
    if (upErr) throw new Error(`subscriptions: upsert failed: ${upErr.message}`);
  }

  return upserts.length;
}
