import { describe, it, expect } from "vitest";
import { toCamelCase, normalizeExpression } from "../engine/expressionNormalizer.js";
import type { ParsedFact } from "../types/skill.js";

// Real fact names as they appear in discount-skill.json (PascalCase, no spaces)
const KNOWN_FACTS: ParsedFact[] = [
  { id: "f1", name: "CustomerTier", camelName: "customerTier", valueType: "Text",       collection: false, isCalculated: false },
  { id: "f2", name: "CustomerId",   camelName: "customerId",   valueType: "Identifier", collection: false, isCalculated: false },
  { id: "f3", name: "OrderValue",   camelName: "orderValue",   valueType: "Numeric",    collection: false, isCalculated: false },
  { id: "f4", name: "Discount",     camelName: "discount",     valueType: "Numeric",    collection: false, isCalculated: true },
];

describe("toCamelCase", () => {
  it("converts multi-word name", () => {
    expect(toCamelCase("Customer Tier")).toBe("customerTier");
  });

  it("lowercases first letter of PascalCase", () => {
    expect(toCamelCase("CustomerId")).toBe("customerId");
    expect(toCamelCase("OrderValue")).toBe("orderValue");
  });

  it("handles single word", () => {
    expect(toCamelCase("Discount")).toBe("discount");
  });

  it("handles already camelCase", () => {
    expect(toCamelCase("orderValue")).toBe("orderValue");
  });
});

describe("normalizeExpression", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeExpression("")).toBe("");
    expect(normalizeExpression("   ")).toBe("");
  });

  it("normalises Member expression — space-separated PascalCase fact name", () => {
    // The JSON expression uses "Customer Tier" (space) but the fact is stored as "CustomerTier"
    const input = "Customer Tier = Member\n&& orderValue >= 50";
    const result = normalizeExpression(input, KNOWN_FACTS);
    expect(result).toBe("customerTier === 'Member' && orderValue >= 50");
  });

  it("normalises Member low-order expression", () => {
    const input = "Customer Tier = Member\n&& orderValue < 50";
    const result = normalizeExpression(input, KNOWN_FACTS);
    expect(result).toBe("customerTier === 'Member' && orderValue < 50");
  });

  it("normalises VIP expression", () => {
    const input = "Customer Tier = VIP";
    const result = normalizeExpression(input, KNOWN_FACTS);
    expect(result).toBe("customerTier === 'VIP'");
  });

  it("normalises PascalCase fact name without space (exact match)", () => {
    // "CustomerTier" as a single PascalCase token should also be replaced
    const input = "CustomerTier = VIP";
    const result = normalizeExpression(input, KNOWN_FACTS);
    expect(result).toBe("customerTier === 'VIP'");
  });

  it("does not corrupt >= or <=", () => {
    const input = "orderValue >= 50 && orderValue <= 100";
    const result = normalizeExpression(input, KNOWN_FACTS);
    expect(result).toBe("orderValue >= 50 && orderValue <= 100");
  });

  it("does not corrupt !=", () => {
    const input = "customerId != ''";
    const result = normalizeExpression(input, KNOWN_FACTS);
    expect(result).not.toContain("!===");
    expect(result).toContain("!=");
  });
});
