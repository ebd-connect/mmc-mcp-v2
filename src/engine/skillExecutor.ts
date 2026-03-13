import type { ParsedSkill, ParsedSlice, ParsedScenario, ParsedOutcome, ExecutionResult } from "../types/skill.js";
import { FactStore } from "./factStore.js";
import { OutcomeTracker } from "./outcomeTracker.js";
import { executeJob, type DataStore } from "./jobExecutor.js";
import { evaluateScenarios } from "./scenarioEvaluator.js";
import { toCamelCase } from "./expressionNormalizer.js";
import type { CapabilityRegistry } from "../capabilities/capability.js";

/**
 * Execute a single interaction slice tool call, then run the full
 * silent-automation dispatch loop until no more automations can fire.
 */
export async function executeSkillTool(
  skill: ParsedSkill,
  interactionSlice: ParsedSlice,
  toolName: string,
  args: Record<string, unknown>,
  dataStore: DataStore,
  capabilityRegistry?: CapabilityRegistry
): Promise<ExecutionResult> {
  const factStore = new FactStore();
  const outcomeTracker = new OutcomeTracker();

  // 1. Load interaction inputs into fact store
  if (interactionSlice.commandFacts) {
    factStore.setFromArgs(interactionSlice.commandFacts, args);
  }

  // 2. Produce the interaction slice's primary outcome(s)
  for (const outcome of interactionSlice.producedOutcomes) {
    outcomeTracker.produce(outcome);
    for (const fact of outcome.facts) {
      if (fact.calculatedValue !== undefined) {
        factStore.applyCalculatedFact(fact);
      }
    }
  }

  // 3. Build a flat list of all known fact camelNames for job mapping normalisation
  const knownCamelNames = skill.slices
    .flatMap((s) => [
      ...(s.commandFacts ?? []),
      ...s.producedOutcomes.flatMap((o) => o.facts),
      ...s.scenarios.flatMap((sc) => sc.thenOutcomes.flatMap((o) => o.facts)),
    ])
    .map((f) => f.camelName);

  // 4. Run the automation dispatch loop
  const processed = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;

    for (const slice of skill.automationSlices) {
      if (processed.has(slice.id)) continue;

      // Skip unless at least one scenario's given[] prerequisites are met
      const preCheck = evaluateScenarios(slice.scenarios, factStore, outcomeTracker);
      if (!preCheck) continue;

      let fired = false;

      if (slice.automation?.capability && capabilityRegistry) {
        // ── Named capability automation ────────────────────────────────────
        const capRef = slice.automation.capability;
        const capability = capabilityRegistry.get(capRef.name);
        if (!capability) {
          return {
            success: false,
            toolName,
            activeOutcomes: outcomeTracker.getActiveNames(),
            facts: factStore.toRecord(),
            error: `Unknown capability: "${capRef.name}". Register it via CapabilityRegistry.`,
          };
        }
        const capResult = await capability.execute(capRef.params, {
          factStore,
          dataStore,
          knownCamelNames,
        });
        // Merge returned facts into the store
        for (const [k, v] of Object.entries(capResult.facts)) {
          factStore.set(k, v);
        }
        // Use found/not-found to pick the scenario path
        const result = await resolveCapabilityScenarios(
          slice, factStore, outcomeTracker, capResult.found ?? false
        );
        if (result === "error") {
          const errorScenario = slice.scenarios.find((s) => s.errorMessage.length > 0);
          return {
            success: false,
            toolName,
            activeOutcomes: outcomeTracker.getActiveNames(),
            facts: factStore.toRecord(),
            error: errorScenario?.errorMessage ?? "Unknown error in capability automation",
          };
        }
        fired = result === "fired";
      } else if (slice.automation?.job) {
        // ── Job-based automation ─────────────────────────────────────────
        // Differentiate guest / success / error paths using the job result,
        // because the scenarios' whenBusinessRule prose is not machine-evaluable.
        const result = await runJobAutomation(
          slice,
          factStore,
          outcomeTracker,
          dataStore,
          slice.automation.job,
          knownCamelNames
        );
        if (result === "error") {
          const errorScenario = slice.scenarios.find((s) => s.errorMessage.length > 0);
          return {
            success: false,
            toolName,
            activeOutcomes: outcomeTracker.getActiveNames(),
            facts: factStore.toRecord(),
            error: errorScenario?.errorMessage ?? "Unknown error in job automation",
          };
        }
        fired = result === "fired";
      } else {
        // ── Expression-based automation ───────────────────────────────────
        const match = evaluateScenarios(slice.scenarios, factStore, outcomeTracker);
        if (match) {
          if (match.isError) {
            return {
              success: false,
              toolName,
              activeOutcomes: outcomeTracker.getActiveNames(),
              facts: factStore.toRecord(),
              error: match.scenario.errorMessage,
            };
          }
          for (const thenOutcome of match.scenario.thenOutcomes) {
            applyOutcome(thenOutcome, factStore, outcomeTracker);
          }
          fired = true;
        }
      }

      if (fired) {
        processed.add(slice.id);
        changed = true;
      }
    }
  }

  // 5. Build result
  const facts = factStore.toRecord();
  const discountRaw = facts[toCamelCase("Discount")];
  const discount = discountRaw !== undefined ? Number(discountRaw) : undefined;

  return {
    success: true,
    toolName,
    activeOutcomes: outcomeTracker.getActiveNames(),
    facts,
    ...(discount !== undefined ? { discount } : {}),
  };
}

// ────────────────────────────────────────────────────────────
// Capability scenario resolution (shared by capability + job paths)
// ────────────────────────────────────────────────────────────

type AutomationResult = "fired" | "skipped" | "error";

/**
 * After a capability has already merged its facts into the store,
 * select and fire the appropriate scenario based on whether a record was found.
 *
 * Uses the same fallback/success heuristics as runJobAutomation so that the
 * behaviour of existing job-based slices is preserved when migrated to capabilities.
 */
async function resolveCapabilityScenarios(
  slice: ParsedSlice,
  factStore: FactStore,
  outcomeTracker: OutcomeTracker,
  found: boolean
): Promise<AutomationResult> {
  const eligible = slice.scenarios.filter((s) => outcomeTracker.hasAll(s.givenOutcomeIds));

  if (!found) {
    const fallback = findFallbackScenario(eligible);
    if (fallback) {
      for (const outcome of fallback.thenOutcomes) applyOutcome(outcome, factStore, outcomeTracker);
      return "fired";
    }
    return "skipped";
  }

  // Record found — first try success scenario, then error, then fallback
  const success = findSuccessScenario(eligible);
  if (success) {
    for (const outcome of success.thenOutcomes) outcomeTracker.produce(outcome);
    return "fired";
  }

  const errorScenario = eligible.find((s) => s.errorMessage.length > 0);
  if (errorScenario) return "error";

  const fallback = findFallbackScenario(eligible);
  if (fallback) {
    for (const outcome of fallback.thenOutcomes) applyOutcome(outcome, factStore, outcomeTracker);
    return "fired";
  }

  return "skipped";
}

// ────────────────────────────────────────────────────────────
// Job automation execution
// ────────────────────────────────────────────────────────────

type JobAutomationResult = "fired" | "skipped" | "error";

/**
 * Execute a job-based automation slice.
 *
 * For slices whose scenarios all lack a machine-evaluable whenExpression
 * (e.g. "validate customer tier"), the job result drives which path fires:
 *   - findTemplate resolves to empty OR job returns null → fallback/guest scenario
 *   - job found a document → apply mappings, fire success scenario
 *   - job returned null AND findValue was non-empty → error scenario
 *
 * "Fallback" scenario = non-error scenario where all thenOutcome facts carry calculatedValue.
 * "Success" scenario  = non-error scenario where at least one thenOutcome fact lacks calculatedValue.
 */
async function runJobAutomation(
  slice: ParsedSlice,
  factStore: FactStore,
  outcomeTracker: OutcomeTracker,
  dataStore: DataStore,
  job: NonNullable<NonNullable<ParsedSlice["automation"]>["job"]>,
  knownCamelNames: string[]
): Promise<JobAutomationResult> {
  const findValue = resolveTemplateFromStore(job.findTemplate, factStore);
  const nonNullableScenarios = slice.scenarios.filter((s) =>
    outcomeTracker.hasAll(s.givenOutcomeIds)
  );

  if (!findValue) {
    // Empty customerId → guest / fallback path
    const fallback = findFallbackScenario(nonNullableScenarios);
    if (fallback) {
      for (const outcome of fallback.thenOutcomes) {
        applyOutcome(outcome, factStore, outcomeTracker);
      }
      return "fired";
    }
    return "skipped";
  }

  const jobResult = await executeJob(job, factStore, dataStore, knownCamelNames);

  if (jobResult.found) {
    // Apply job mapping results
    for (const [camelKey, value] of Object.entries(jobResult.mappings)) {
      factStore.set(camelKey, value);
    }
    // Fire success scenario: thenFacts without calculatedValue (value came from job)
    const success = findSuccessScenario(nonNullableScenarios);
    if (success) {
      // Produce the outcome but do NOT apply calculatedValue overrides —
      // the actual values are already in factStore from the job result.
      for (const outcome of success.thenOutcomes) {
        outcomeTracker.produce(outcome);
      }
      return "fired";
    }
  } else {
    // Non-empty customerId but not found in DB → error or fallback
    const errorScenario = nonNullableScenarios.find((s) => s.errorMessage.length > 0);
    if (errorScenario) return "error";

    // Graceful fallback if no explicit error scenario
    const fallback = findFallbackScenario(nonNullableScenarios);
    if (fallback) {
      for (const outcome of fallback.thenOutcomes) {
        applyOutcome(outcome, factStore, outcomeTracker);
      }
      return "fired";
    }
  }

  return "skipped";
}

/**
 * "Fallback" = non-error scenario where ALL facts in each thenOutcome carry a calculatedValue.
 * This is the hardcoded-value path (e.g. CustomerTier="Guest").
 */
function findFallbackScenario(scenarios: ParsedScenario[]): ParsedScenario | undefined {
  return scenarios.find(
    (s) =>
      s.errorMessage.length === 0 &&
      s.thenOutcomes.every((o) => o.facts.every((f) => f.calculatedValue !== undefined))
  );
}

/**
 * "Success" = non-error scenario where at least one thenOutcome fact lacks calculatedValue.
 * This is the dynamic-value path (e.g. CustomerTier comes from the DB result).
 */
function findSuccessScenario(scenarios: ParsedScenario[]): ParsedScenario | undefined {
  return scenarios.find(
    (s) =>
      s.errorMessage.length === 0 &&
      s.thenOutcomes.some((o) => o.facts.some((f) => f.calculatedValue === undefined))
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function resolveTemplateFromStore(template: string, factStore: FactStore): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = factStore.get(toCamelCase(name));
    return value !== undefined && value !== "" ? String(value) : "";
  });
}

function applyOutcome(
  outcome: ParsedOutcome,
  factStore: FactStore,
  outcomeTracker: OutcomeTracker
): void {
  for (const fact of outcome.facts) {
    if (fact.calculatedValue !== undefined) {
      factStore.applyCalculatedFact(fact);
    }
  }
  outcomeTracker.produce(outcome);
}
