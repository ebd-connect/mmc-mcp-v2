import { compile } from "expression-eval";
import type { ParsedScenario } from "../types/skill.js";
import type { FactStore } from "./factStore.js";
import type { OutcomeTracker } from "./outcomeTracker.js";

export interface ScenarioMatch {
  scenario: ParsedScenario;
  isError: boolean;
}

/**
 * Evaluate a list of scenarios against current fact/outcome state.
 * Returns the first scenario whose prerequisites (given[]) are all satisfied
 * AND whose whenExpression (if any) evaluates to true.
 *
 * NOTE: `givenBusinessRule` is human prose — it is never machine-evaluated here.
 * The machine signal is the `givenOutcomeIds` array (ID set membership).
 */
export function evaluateScenarios(
  scenarios: ParsedScenario[],
  factStore: FactStore,
  outcomeTracker: OutcomeTracker
): ScenarioMatch | null {
  for (const scenario of scenarios) {
    // 1. Check all given outcome IDs are active
    if (!outcomeTracker.hasAll(scenario.givenOutcomeIds)) {
      continue;
    }

    // 2. Evaluate whenExpression (null = unconditional)
    if (scenario.whenExpression !== null) {
      const matches = evaluateExpression(scenario.whenExpression, factStore);
      if (!matches) continue;
    }

    return {
      scenario,
      isError: scenario.errorMessage.length > 0,
    };
  }

  return null;
}

function evaluateExpression(expression: string, factStore: FactStore): boolean {
  try {
    const fn = compile(expression);
    const result = fn(factStore.toContext());
    return Boolean(result);
  } catch (err) {
    console.error(`[scenarioEvaluator] Failed to evaluate expression: "${expression}"`, err);
    return false;
  }
}
