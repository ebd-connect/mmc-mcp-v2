import { describe, it, expect, beforeEach } from "vitest";
import { evaluateScenarios } from "../engine/scenarioEvaluator.js";
import { FactStore } from "../engine/factStore.js";
import { OutcomeTracker } from "../engine/outcomeTracker.js";
import type { ParsedScenario, ParsedOutcome } from "../types/skill.js";

const makeOutcome = (id: string, name: string): ParsedOutcome => ({
  id,
  name,
  facts: [],
});

const makeScenario = (
  givenIds: string[],
  whenExpression: string | null,
  thenName: string,
  errorMsg = ""
): ParsedScenario => ({
  id: `scenario-${thenName}`,
  givenOutcomeIds: givenIds,
  givenBusinessRule: "",
  whenExpression,
  thenOutcomes: [makeOutcome(`outcome-${thenName}`, thenName)],
  errorMessage: errorMsg,
});

describe("evaluateScenarios", () => {
  let factStore: FactStore;
  let tracker: OutcomeTracker;

  beforeEach(() => {
    factStore = new FactStore();
    tracker = new OutcomeTracker();
  });

  it("returns null when no given IDs are active", () => {
    const scenarios = [makeScenario(["outcome-A"], null, "result")];
    expect(evaluateScenarios(scenarios, factStore, tracker)).toBeNull();
  });

  it("matches unconditional scenario (no whenExpression) when given is satisfied", () => {
    tracker.produce(makeOutcome("outcome-A", "A"));
    const scenarios = [makeScenario(["outcome-A"], null, "result")];
    const match = evaluateScenarios(scenarios, factStore, tracker);
    expect(match).not.toBeNull();
    expect(match?.scenario.thenOutcomes[0]?.name).toBe("result");
  });

  it("evaluates whenExpression correctly", () => {
    tracker.produce(makeOutcome("outcome-A", "A"));
    factStore.set("customerTier", "Member");
    factStore.set("orderValue", 75);

    const scenarios = [
      makeScenario(["outcome-A"], "customerTier === 'Member' && orderValue >= 50", "member-high"),
      makeScenario(["outcome-A"], "customerTier === 'Member' && orderValue < 50", "member-low"),
    ];

    const match = evaluateScenarios(scenarios, factStore, tracker);
    expect(match?.scenario.thenOutcomes[0]?.name).toBe("member-high");
  });

  it("returns first-match (not second) when both could match", () => {
    tracker.produce(makeOutcome("outcome-A", "A"));
    factStore.set("x", 10);

    const scenarios = [
      makeScenario(["outcome-A"], "x > 5", "first"),
      makeScenario(["outcome-A"], "x > 5", "second"),
    ];

    const match = evaluateScenarios(scenarios, factStore, tracker);
    expect(match?.scenario.thenOutcomes[0]?.name).toBe("first");
  });

  it("marks isError true when scenario has errorMessage", () => {
    tracker.produce(makeOutcome("outcome-A", "A"));
    const scenarios = [makeScenario(["outcome-A"], null, "error-result", "Something went wrong")];
    const match = evaluateScenarios(scenarios, factStore, tracker);
    expect(match?.isError).toBe(true);
  });

  it("skips scenarios whose expression is false", () => {
    tracker.produce(makeOutcome("outcome-A", "A"));
    factStore.set("customerTier", "Guest");

    const scenarios = [
      makeScenario(["outcome-A"], "customerTier === 'VIP'", "vip"),
      makeScenario(["outcome-A"], null, "fallback"),
    ];

    const match = evaluateScenarios(scenarios, factStore, tracker);
    expect(match?.scenario.thenOutcomes[0]?.name).toBe("fallback");
  });
});
