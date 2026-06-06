import { describe, it, expect } from "vitest";
import { coerceAmountToCents, coerceDate, normalizeMerchant } from "./coerce";

describe("coerceAmountToCents", () => {
  it("parses plain and decorated amounts to signed cents", () => {
    expect(coerceAmountToCents("$1,234.50")).toBe(123450);
    expect(coerceAmountToCents("45")).toBe(4500);
    expect(coerceAmountToCents("-12.5")).toBe(-1250);
    expect(coerceAmountToCents(12.5)).toBe(1250);
    expect(coerceAmountToCents("12.345")).toBe(1235); // rounds to cents
  });

  it("treats accounting parentheses as negative", () => {
    expect(coerceAmountToCents("(45.00)")).toBe(-4500);
    expect(coerceAmountToCents("($1,000.00)")).toBe(-100000);
  });

  it("handles decimal-comma vs thousands-comma", () => {
    expect(coerceAmountToCents("1,50")).toBe(150); // decimal comma
    expect(coerceAmountToCents("1,500")).toBe(150000); // thousands
  });

  it("returns null for unparseable input", () => {
    expect(coerceAmountToCents("")).toBeNull();
    expect(coerceAmountToCents("n/a")).toBeNull();
    expect(coerceAmountToCents(null)).toBeNull();
    expect(coerceAmountToCents(undefined)).toBeNull();
  });
});

describe("coerceDate", () => {
  it("passes through valid ISO", () => {
    expect(coerceDate("2024-03-09")).toBe("2024-03-09");
  });

  it("parses US MM/DD/YYYY by default", () => {
    expect(coerceDate("03/09/2024")).toBe("2024-03-09");
  });

  it("disambiguates to DD/MM when the first field exceeds 12", () => {
    expect(coerceDate("13/02/2024")).toBe("2024-02-13");
  });

  it("parses YYYY/MM/DD and dashed forms (MM-DD default)", () => {
    expect(coerceDate("2024/03/09")).toBe("2024-03-09");
    expect(coerceDate("3-9-2024")).toBe("2024-03-09"); // MM-DD-YYYY
  });

  it("expands 2-digit years", () => {
    expect(coerceDate("03/09/24")).toBe("2024-03-09");
    expect(coerceDate("03/09/85")).toBe("1985-03-09");
  });

  it("returns null for junk and impossible dates", () => {
    expect(coerceDate("not a date")).toBeNull();
    expect(coerceDate("02/30/2024")).toBeNull();
    expect(coerceDate("")).toBeNull();
  });
});

describe("normalizeMerchant", () => {
  it("uppercases and collapses whitespace", () => {
    expect(normalizeMerchant("  Blue   Bottle  ")).toBe("BLUE BOTTLE");
  });

  it("strips card-network/POS prefixes and trailing store numbers", () => {
    expect(normalizeMerchant("SQ *Blue Bottle #123")).toBe("BLUE BOTTLE");
    expect(normalizeMerchant("TST* Joe's Diner")).toBe("JOE'S DINER");
  });

  it("clusters variants to the same key", () => {
    expect(normalizeMerchant("PAYPAL *NETFLIX 0042")).toBe(
      normalizeMerchant("Netflix"),
    );
  });

  it("returns null for empty input", () => {
    expect(normalizeMerchant("")).toBeNull();
    expect(normalizeMerchant(null)).toBeNull();
  });
});
