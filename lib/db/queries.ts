import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import * as C from "@/lib/contracts";

/**
 * Parameterized, bounded query functions backing the tools (PRD-B1).
 * THERE IS NO TEXT-TO-SQL — the model never emits SQL, it calls these. Every
 * query is range- and row-bounded, and "how much / trend" reads come from the
 * precomputed `rollups` table, never raw transaction rows (SPEC §5.1).
 */

type SpendingIn = z.infer<typeof C.GetSpendingInput>;
type SpendingOut = z.infer<typeof C.GetSpendingOutput>;
type TxnIn = z.infer<typeof C.GetTransactionsInput>;
type TxnOut = z.infer<typeof C.GetTransactionsOutput>;
type TrendIn = z.infer<typeof C.GetTrendInput>;
type TrendOut = z.infer<typeof C.GetTrendOutput>;
type SubsOut = z.infer<typeof C.GetSubscriptionsOutput>;
type AnomIn = z.infer<typeof C.GetAnomaliesInput>;
type AnomOut = z.infer<typeof C.GetAnomaliesOutput>;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** All month-start keys (YYYY-MM-01) touched by an inclusive date range. */
function monthsInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let y = Number(startDate.slice(0, 4));
  let m = Number(startDate.slice(5, 7));
  const ey = Number(endDate.slice(0, 4));
  const em = Number(endDate.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${pad2(m)}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ---- getSpending: reads precomputed rollups (no raw rows) ------------------
export async function getSpending(
  supabase: SupabaseClient,
  userId: string,
  input: SpendingIn,
): Promise<SpendingOut> {
  const months = monthsInRange(input.startDate, input.endDate);
  const perCategory = input.groupBy === "category";
  const baseCat = input.category ?? "__all__";

  let query = supabase
    .from("rollups")
    .select("period_start, category, total_spend_cents")
    .eq("user_id", userId)
    .eq("period_type", "month")
    .in("period_start", months);
  query = perCategory ? query.neq("category", "__all__") : query.eq("category", baseCat);

  const { data, error } = await query;
  if (error) throw new Error(`getSpending failed: ${error.message}`);

  const rows = (data as { period_start: string; category: string; total_spend_cents: number }[] | null) ?? [];
  let total = 0;
  const grouped = new Map<string, number>();
  for (const r of rows) {
    total += r.total_spend_cents;
    if (input.groupBy) {
      const key = input.groupBy === "month" ? r.period_start : r.category;
      grouped.set(key, (grouped.get(key) ?? 0) + r.total_spend_cents);
    }
  }

  const breakdown = input.groupBy
    ? [...grouped.entries()]
        .map(([key, amount_cents]) => ({ key, amount_cents }))
        .sort((a, b) => b.amount_cents - a.amount_cents)
    : [];

  return {
    total_cents: total,
    currency: "USD",
    period: { start: input.startDate, end: input.endDate },
    groupBy: input.groupBy ?? null,
    breakdown,
  };
}

// ---- getTransactions: bounded indexed select (the raw-row exception) -------
export async function getTransactions(
  supabase: SupabaseClient,
  userId: string,
  input: TxnIn,
): Promise<TxnOut> {
  const f = input.filters;
  let query = supabase
    .from("transactions")
    .select("txn_date, merchant_norm, category, amount_cents, currency")
    .eq("user_id", userId);

  if (f.category) query = query.eq("category", f.category);
  if (f.merchant) query = query.ilike("merchant_norm", `%${f.merchant.toUpperCase()}%`);
  if (f.startDate) query = query.gte("txn_date", f.startDate);
  if (f.endDate) query = query.lte("txn_date", f.endDate);
  if (f.min != null) query = query.gte("amount_cents", Math.round(f.min * 100));
  if (f.max != null) query = query.lte("amount_cents", Math.round(f.max * 100));

  const sort: Record<TxnIn["sort"], { col: string; asc: boolean }> = {
    date_desc: { col: "txn_date", asc: false },
    date_asc: { col: "txn_date", asc: true },
    amount_desc: { col: "amount_cents", asc: false },
    amount_asc: { col: "amount_cents", asc: true },
  };
  const s = sort[input.sort];

  const { data, error } = await query
    .order(s.col, { ascending: s.asc })
    .limit(input.limit + 1); // +1 to detect hasMore
  if (error) throw new Error(`getTransactions failed: ${error.message}`);

  const rows = (data as { txn_date: string; merchant_norm: string | null; category: string; amount_cents: number; currency: string }[] | null) ?? [];
  const hasMore = rows.length > input.limit;
  return {
    rows: rows.slice(0, input.limit).map((r) => ({
      date: r.txn_date,
      merchant: r.merchant_norm,
      category: r.category,
      amount_cents: r.amount_cents,
      currency: r.currency,
    })),
    hasMore,
  };
}

// ---- getTrend: reads the monthly rollup series ----------------------------
export async function getTrend(
  supabase: SupabaseClient,
  userId: string,
  input: TrendIn,
): Promise<TrendOut> {
  const cat = input.category ?? "__all__";
  const { data, error } = await supabase
    .from("rollups")
    .select("period_start, total_spend_cents")
    .eq("user_id", userId)
    .eq("period_type", "month")
    .eq("category", cat)
    .order("period_start", { ascending: true });
  if (error) throw new Error(`getTrend failed: ${error.message}`);

  const all = (data as { period_start: string; total_spend_cents: number }[] | null) ?? [];
  const series = all.slice(-input.periods);
  const current = series.length > 0 ? series[series.length - 1]!.total_spend_cents : 0;
  const prior = series.slice(0, -1);
  const average =
    prior.length > 0
      ? Math.round(prior.reduce((a, b) => a + b.total_spend_cents, 0) / prior.length)
      : 0;
  const delta_pct =
    average > 0 ? Number((((current - average) / average) * 100).toFixed(1)) : null;

  return {
    category: input.category ?? null,
    series,
    current_cents: current,
    average_cents: average,
    delta_pct,
  };
}

// ---- getSubscriptions: reads the detected recurring charges ----------------
export async function getSubscriptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubsOut> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("merchant_norm, cadence_days, avg_amount_cents, next_expected, confidence")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("confidence", { ascending: false });
  if (error) throw new Error(`getSubscriptions failed: ${error.message}`);

  return {
    subscriptions: ((data as SubsOut["subscriptions"] | null) ?? []).map((s) => ({
      merchant_norm: s.merchant_norm,
      cadence_days: s.cadence_days,
      avg_amount_cents: s.avg_amount_cents,
      next_expected: s.next_expected,
      confidence: s.confidence,
    })),
  };
}

// ---- getAnomalies: reads precomputed flags --------------------------------
export async function getAnomalies(
  supabase: SupabaseClient,
  userId: string,
  input: AnomIn,
): Promise<AnomOut> {
  let query = supabase
    .from("anomalies")
    .select("type, score, reason")
    .eq("user_id", userId);
  if (input.status === "new") query = query.eq("status", "new");

  const { data, error } = await query
    .order("score", { ascending: false })
    .limit(50);
  if (error) throw new Error(`getAnomalies failed: ${error.message}`);

  return {
    anomalies: ((data as { type: AnomOut["anomalies"][number]["type"]; score: number; reason: string }[] | null) ?? []).map((a) => ({
      type: a.type,
      score: a.score,
      reason: a.reason,
      txn: null,
    })),
  };
}

/** Compact recent-rollup context for the reasoning-tier synthesis tools. */
export async function getRollupContext(
  supabase: SupabaseClient,
  userId: string,
  months = 6,
): Promise<{ period_start: string; category: string; total_spend_cents: number; total_income_cents: number }[]> {
  const { data, error } = await supabase
    .from("rollups")
    .select("period_start, category, total_spend_cents, total_income_cents")
    .eq("user_id", userId)
    .eq("period_type", "month")
    .order("period_start", { ascending: false })
    .limit(months * 14); // ~13 categories + __all__ per month
  if (error) throw new Error(`getRollupContext failed: ${error.message}`);
  return (data as { period_start: string; category: string; total_spend_cents: number; total_income_cents: number }[] | null) ?? [];
}
