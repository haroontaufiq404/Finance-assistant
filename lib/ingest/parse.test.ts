import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTransactions } from "./parse";
import { dedupeInBatch, contentHash } from "./dedup";

const fixture = readFileSync(
  new URL("../../fixtures/sample-transactions.csv", import.meta.url),
  "utf8",
);

describe("parseTransactions (sample fixture)", () => {
  const result = parseTransactions(fixture);

  it("validates the well-formed rows (incl. the duplicate as valid)", () => {
    expect(result.valid.length).toBe(24);
  });

  it("quarantines the missing-amount and junk rows, never drops them", () => {
    expect(result.errors.length).toBe(2);
    const reasons = result.errors.map((e) => e.reason);
    expect(reasons).toContain("missing or unparseable amount");
    expect(reasons).toContain("missing or unparseable date");
  });

  it("parses decorated amounts to signed cents", () => {
    const oliveGarden = result.valid.find((t) => t.merchant_norm === "OLIVE GARDEN");
    expect(oliveGarden?.amount_cents).toBe(-5420); // ($54.20)
    const costco = result.valid.find((t) => t.merchant_norm === "COSTCO");
    expect(costco?.amount_cents).toBe(-120455); // -1,204.55
  });

  it("normalizes merchants so variants cluster", () => {
    const wholeFoods = result.valid.filter((t) => t.merchant_norm === "WHOLE FOODS MARKET");
    expect(wholeFoods.length).toBe(4); // incl. the duplicate
  });
});

describe("dedupeInBatch", () => {
  it("removes the in-file duplicate and keeps unique rows", () => {
    const { valid } = parseTransactions(fixture);
    const { rows, inFileDuplicates } = dedupeInBatch("user-1", valid);
    expect(inFileDuplicates).toBe(1);
    expect(rows.length).toBe(23);
  });

  it("produces a stable, user-scoped content hash", () => {
    const { valid } = parseTransactions(fixture);
    const a = dedupeInBatch("user-1", valid).rows[0]!;
    const b = dedupeInBatch("user-1", valid).rows[0]!;
    expect(a.content_hash).toBe(b.content_hash);
    // Different user -> different hash for the same transaction.
    const other = contentHash("user-2", valid[0]!);
    expect(other).not.toBe(a.content_hash);
  });
});

describe("normalizeRow column detection", () => {
  it("handles separate debit/credit columns", () => {
    const csv =
      "Date,Description,Debit,Credit\n" +
      "01/05/2024,Coffee,4.50,\n" +
      "01/06/2024,Refund,,10.00\n";
    const { valid, errors } = parseTransactions(csv);
    expect(errors.length).toBe(0);
    expect(valid[0]?.amount_cents).toBe(-450); // debit -> spend
    expect(valid[1]?.amount_cents).toBe(1000); // credit -> income
  });

  it("reports a clear error when essential columns are absent", () => {
    const csv = "Foo,Bar\n1,2\n3,4\n";
    const { valid, errors } = parseTransactions(csv);
    expect(valid.length).toBe(0);
    expect(errors.length).toBe(2);
    expect(errors[0]?.reason).toMatch(/could not detect/);
  });
});
