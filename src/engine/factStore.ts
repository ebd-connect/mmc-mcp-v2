import type { ParsedFact } from "../types/skill.js";

/**
 * Per-call mutable key/value store for facts.
 * Keys are camelCase fact names (e.g. "customerId", "orderValue").
 */
export class FactStore {
  private readonly store = new Map<string, unknown>();

  set(camelName: string, value: unknown): void {
    this.store.set(camelName, value);
  }

  get(camelName: string): unknown {
    return this.store.get(camelName);
  }

  has(camelName: string): boolean {
    return this.store.has(camelName);
  }

  /**
   * Load tool call arguments into the store, coercing by valueType.
   */
  setFromArgs(facts: ParsedFact[], args: Record<string, unknown>): void {
    for (const fact of facts) {
      const raw = args[fact.camelName];
      if (raw !== undefined) {
        this.store.set(fact.camelName, coerce(raw, fact.valueType));
      }
    }
  }

  /**
   * Apply a fact that carries a hardcoded calculatedValue (from a scenario then[]).
   */
  applyCalculatedFact(fact: ParsedFact): void {
    if (fact.calculatedValue === undefined) return;
    this.store.set(fact.camelName, coerce(fact.calculatedValue, fact.valueType));
  }

  /**
   * Build a context object for expression-eval evaluation.
   */
  toContext(): Record<string, unknown> {
    return Object.fromEntries(this.store);
  }

  /**
   * Snapshot of all stored facts for the ExecutionResult.
   */
  toRecord(): Record<string, unknown> {
    return Object.fromEntries(this.store);
  }
}

function coerce(value: unknown, valueType: string): unknown {
  if (valueType === "Numeric") {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }
  return String(value ?? "");
}
