import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  formatLabel,
  getStatusVariant,
} from "./formatters";

describe("formatDate", () => {
  it("returns em-dash for falsy input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats a valid ISO date string", () => {
    const result = formatDate("2024-03-15");
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/2024/);
  });

  it("returns original value for invalid date strings", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDateTime", () => {
  it("returns em-dash for falsy input", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("includes time components for a valid datetime", () => {
    const result = formatDateTime("2024-06-01T14:30:00Z");
    expect(result).toMatch(/2024/);
  });
});

describe("formatCurrency", () => {
  it("returns em-dash for non-numeric strings", () => {
    // "abc" → Number("abc") = NaN → not finite → em-dash
    expect(formatCurrency("abc")).toBe("—");
    expect(formatCurrency(NaN)).toBe("—");
  });

  it("formats null as £0.00 (Number(null) === 0)", () => {
    // Number(null) = 0 which is finite — intentional passthrough
    expect(formatCurrency(null)).toMatch(/0/);
  });

  it("formats a number as GBP", () => {
    const result = formatCurrency(12.5);
    expect(result).toContain("12");
    expect(result).toMatch(/£|GBP/);
  });

  it("handles zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });
});

describe("formatNumber", () => {
  it("returns em-dash for undefined (Number(undefined) = NaN)", () => {
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(NaN)).toBe("—");
  });

  it("formats integers", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("formats decimals up to 2dp", () => {
    const result = formatNumber(3.14159);
    expect(result).toMatch(/3\.14/);
  });
});

describe("formatLabel", () => {
  it("returns em-dash for falsy input", () => {
    expect(formatLabel(null)).toBe("—");
    expect(formatLabel("")).toBe("—");
  });

  it("capitalises and splits on underscores", () => {
    expect(formatLabel("purchase_order")).toBe("Purchase Order");
  });

  it("capitalises and splits on hyphens", () => {
    expect(formatLabel("sales-order")).toBe("Sales Order");
  });

  it("handles single word", () => {
    expect(formatLabel("draft")).toBe("Draft");
  });
});

describe("getStatusVariant", () => {
  it("returns positive for active/received/dispatched", () => {
    expect(getStatusVariant("active")).toBe("positive");
    expect(getStatusVariant("received")).toBe("positive");
    expect(getStatusVariant("dispatched")).toBe("positive");
  });

  it("returns info for ordered/confirmed/allocated/partial", () => {
    expect(getStatusVariant("ordered")).toBe("info");
    expect(getStatusVariant("confirmed")).toBe("info");
    expect(getStatusVariant("allocated")).toBe("info");
    expect(getStatusVariant("partial")).toBe("info");
  });

  it("returns negative for cancelled/inactive", () => {
    expect(getStatusVariant("cancelled")).toBe("negative");
    expect(getStatusVariant("inactive")).toBe("negative");
  });

  it("returns neutral for draft and unknown values", () => {
    expect(getStatusVariant("draft")).toBe("neutral");
    expect(getStatusVariant("unknown-thing")).toBe("neutral");
  });

  it("is case-insensitive", () => {
    expect(getStatusVariant("ACTIVE")).toBe("positive");
    expect(getStatusVariant("Cancelled")).toBe("negative");
  });

  it("returns neutral for null/undefined", () => {
    expect(getStatusVariant(null)).toBe("neutral");
    expect(getStatusVariant(undefined)).toBe("neutral");
  });
});
