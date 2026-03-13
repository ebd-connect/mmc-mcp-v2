/**
 * Converts natural-language `whenBusinessRule` strings (from skill JSON) into
 * valid JavaScript expressions that can be evaluated by `expression-eval`.
 *
 * Example input:  "Customer Tier = Member\n&& orderValue >= 50"
 * Example output: "customerTier === 'Member' && orderValue >= 50"
 */

import type { ParsedFact } from "../types/skill.js";

/**
 * Convert a space/underscore-separated name to lowerCamelCase.
 *
 * Examples:
 *   "Customer Tier" → "customerTier"
 *   "CustomerId"    → "customerId"
 *   "OrderValue"    → "orderValue"
 */
export function toCamelCase(name: string): string {
  const words = name.split(/[\s_]+/);
  const [first, ...rest] = words;
  if (!first) return name;
  return (
    first.charAt(0).toLowerCase() +
    first.slice(1) +
    rest.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : "")).join("")
  );
}

/**
 * Escape a string for use inside a RegExp.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Expand a PascalCase name into a space-separated version.
 * "CustomerTier" → "Customer Tier"
 * "OrderValue"   → "Order Value"
 * "customerId"   → "customer Id" (already camelCase — returned as-is if same)
 */
function pascalToSpaced(name: string): string {
  return name.replace(/([A-Z])/g, " $1").trim();
}

/**
 * Replace known fact names (and their PascalCase space-separated expansions)
 * with their camelCase equivalents. Sorts by name length (longest first)
 * to avoid partial replacement.
 *
 * Handles both:
 *   - exact name: "CustomerId"  → "customerId"
 *   - spaced PascalCase: "Customer Tier" → "customerTier"
 */
function replaceFactNames(expr: string, knownFacts: ParsedFact[]): string {
  // Build list of (pattern, replacement) pairs, sorted by pattern length descending
  type Replacement = { pattern: RegExp; camelName: string; patternLen: number };
  const replacements: Replacement[] = [];

  for (const fact of knownFacts) {
    // Exact name (may contain spaces if multi-word)
    const escapedExact = escapeRegExp(fact.name).replace(/\\ /g, "\\s+");
    replacements.push({
      pattern: new RegExp(escapedExact, "gi"),
      camelName: fact.camelName,
      patternLen: fact.name.length,
    });

    // PascalCase → space-separated expansion (e.g. "CustomerTier" → "Customer Tier")
    const spaced = pascalToSpaced(fact.name);
    if (spaced !== fact.name) {
      const escapedSpaced = escapeRegExp(spaced).replace(/\\ /g, "\\s+");
      replacements.push({
        pattern: new RegExp(escapedSpaced, "gi"),
        camelName: fact.camelName,
        patternLen: spaced.length,
      });
    }
  }

  // Sort longest patterns first to prevent shorter ones from partially replacing
  replacements.sort((a, b) => b.patternLen - a.patternLen);

  let result = expr;
  for (const { pattern, camelName } of replacements) {
    result = result.replace(pattern, camelName);
  }
  return result;
}

/**
 * Normalise a raw `whenBusinessRule` string into an evaluable JS expression.
 *
 * Steps:
 *  1. Collapse newlines → spaces
 *  2. Replace multi-word fact names with camelCase (using knownFacts list)
 *  3. Normalise bare `=` → `===` (leaving `>=`, `<=`, `!=` intact)
 *  4. Wrap bare word RHS operands after `===` in single quotes
 */
export function normalizeExpression(raw: string, knownFacts: ParsedFact[] = []): string {
  if (!raw.trim()) return "";

  // Step 1: collapse newlines
  let expr = raw.replace(/\r?\n/g, " ").trim();

  // Step 2: replace multi-word fact names with camelCase
  if (knownFacts.length > 0) {
    expr = replaceFactNames(expr, knownFacts);
  }

  // Step 3: normalise bare `=` → `===`
  // Negative lookbehind: not preceded by !, <, >, =
  // Negative lookahead: not followed by =
  expr = expr.replace(/(?<![!<>=])=(?!=)/g, "===");

  // Step 4: wrap bare identifier RHS of === in single quotes
  // Match: === followed by optional spaces then a bare word (letters/digits, not already quoted)
  expr = expr.replace(/===\s*([A-Za-z][A-Za-z0-9_]*)/g, "=== '$1'");

  return expr;
}
