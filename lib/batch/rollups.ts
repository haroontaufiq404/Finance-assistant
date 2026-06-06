import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recompute monthly rollups (PRD-A3, SPEC §7). Per (month, category) plus a
 * `__all__` row per month. This precomputed table is the read path's workhorse:
 * its size scales with TIME PERIODS, not transaction count, so it survives
 * 10x-100x data. Idempotent upsert on the rollups PK.
 *
 * Aggregation runs in JS here (write path, runs once at ingest). At larger
 * scale this becomes a Postgres GROUP BY / date_trunc job — same table shape.
 */

interface TxnRow {
  amount_cents: number;
  category: string;
  txn_date: string;
}

interface Agg {
  spend: number;
  income: number;
  count: number;
}

function monthRange(monthStart: string): { start: string; end: string } {
  const [y, m] = monthStart.split("-").map(Number) as [number, number];
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start: monthStart, end };
}

async function allMonths(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("txn_date")
    .eq("user_id", userId);
  if (error) throw new Error(`rollups: month scan failed: ${error.message}`);
  const months = new Set<string>();
  for (const r of (data as { txn_date: string }[] | null) ?? []) {
    months.add(`${r.txn_date.slice(0, 7)}-01`);
  }
  return [...months];
}

export async function recomputeRollups(
  supabase: SupabaseClient,
  userId: string,
  months?: string[],
): Promise<number> {
  const targets = months && months.length > 0 ? months : await allMonths(supabase, userId);
  let written = 0;

  for (const monthStart of targets) {
    const { start, end } = monthRange(monthStart);
    const { data, error } = await supabase
      .from("transactions")
      .select("amount_cents, category, txn_date")
      .eq("user_id", userId)
      .gte("txn_date", start)
      .lt("txn_date", end);
    if (error) throw new Error(`rollups: fetch ${monthStart} failed: ${error.message}`);

    const perCat = new Map<string, Agg>();
    const all: Agg = { spend: 0, income: 0, count: 0 };

    for (const row of (data as TxnRow[] | null) ?? []) {
      const cat = row.category;
      const agg = perCat.get(cat) ?? { spend: 0, income: 0, count: 0 };
      if (row.amount_cents < 0) {
        agg.spend += -row.amount_cents;
        all.spend += -row.amount_cents;
      } else {
        agg.income += row.amount_cents;
        all.income += row.amount_cents;
      }
      agg.count += 1;
      all.count += 1;
      perCat.set(cat, agg);
    }

    const rows = [toRow(userId, monthStart, "__all__", all)];
    for (const [cat, agg] of perCat) rows.push(toRow(userId, monthStart, cat, agg));

    const { error: upErr } = await supabase
      .from("rollups")
      .upsert(rows, { onConflict: "user_id,period_type,period_start,category" });
    if (upErr) throw new Error(`rollups: upsert ${monthStart} failed: ${upErr.message}`);
    written += rows.length;
  }

  return written;
}

function toRow(userId: string, periodStart: string, category: string, agg: Agg) {
  return {
    user_id: userId,
    period_type: "month",
    period_start: periodStart,
    category,
    total_spend_cents: agg.spend,
    total_income_cents: agg.income,
    txn_count: agg.count,
  };
}
