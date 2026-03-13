import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  RawFact,
  RawOutcome,
  RawScenario,
  RawSkill,
  RawSlice,
  ParsedFact,
  ParsedOutcome,
  ParsedScenario,
  ParsedSlice,
  ParsedSkill,
  ParsedCapabilityRef,
  SliceKind,
} from "../types/skill.js";
import { toCamelCase, normalizeExpression } from "../engine/expressionNormalizer.js";

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export async function loadAllSkills(skillsDir: string): Promise<ParsedSkill[]> {
  const files = await readdir(skillsDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const skills: ParsedSkill[] = [];
  for (const file of jsonFiles) {
    const raw = JSON.parse(await readFile(join(skillsDir, file), "utf-8")) as RawSkill;
    const skillId = file.replace(/\.json$/, "");
    skills.push(parseSkill(raw, skillId));
  }
  return skills;
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

function parseFact(raw: RawFact, calculatedValue?: string): ParsedFact {
  return {
    id: raw.id,
    name: raw.name,
    camelName: toCamelCase(raw.name),
    valueType: raw.valueType,
    collection: raw.collection,
    isCalculated: raw.isCalculated ?? false,
    ...(calculatedValue !== undefined ? { calculatedValue } : {}),
  };
}

function parseOutcome(raw: RawOutcome): ParsedOutcome {
  return {
    id: raw.id,
    name: raw.name,
    facts: raw.facts.map((f) => parseFact(f, f.calculatedValue)),
  };
}

function parseScenario(raw: RawScenario, knownFacts: ParsedFact[]): ParsedScenario {
  const normalized = normalizeExpression(raw.whenBusinessRule, knownFacts);
  return {
    id: raw.id,
    givenOutcomeIds: raw.given.map((o) => o.id),
    givenBusinessRule: raw.givenBusinessRule,
    whenExpression: normalized || null,
    thenOutcomes: raw.then.map(parseOutcome),
    errorMessage: raw.error,
  };
}

function classifySlice(slice: RawSlice): SliceKind {
  if (slice.automation !== undefined) return "automation";
  if (slice.command !== undefined) return "interaction";
  return "view";
}

function parseSlice(raw: RawSlice, knownFacts: ParsedFact[]): ParsedSlice {
  const kind = classifySlice(raw);

  // Collect all facts mentioned in this slice for expression normalisation
  const sliceFacts: ParsedFact[] = raw.facts.map((f) => parseFact(f));

  const scenarios = raw.scenarios.map((s) =>
    parseScenario(s, [...knownFacts, ...sliceFacts])
  );

  const base: ParsedSlice = {
    id: raw.id,
    name: raw.name,
    kind,
    role: raw.role,
    producedOutcomes: raw.outcomes.map(parseOutcome),
    scenarios,
  };

  if (kind === "interaction" && raw.command) {
    base.commandName = raw.command.name;
    base.commandFacts = raw.command.facts.map((f) => parseFact(f));
  }

  if (kind === "automation" && raw.automation) {
    const auto = raw.automation;

    // Parse explicit capability reference (takes precedence over the job shorthand)
    let capability: ParsedCapabilityRef | undefined;
    if (auto.capability) {
      capability = { name: auto.capability.name, params: auto.capability.params };
    }

    base.automation = {
      id: auto.id,
      name: auto.name,
      ...(auto.job
        ? {
            job: {
              collection: auto.job.collection,
              findTemplate: auto.job.find,
              mappings: auto.job.mappings,
              cursorName: auto.job.returnedFact.name,
            },
          }
        : {}),
      ...(capability ? { capability } : {}),
    };
  }

  return base;
}

function parseSkill(raw: RawSkill, skillId: string): ParsedSkill {
  // Build a global known-facts list from all slice facts (for expression normalisation)
  const allRawFacts: RawFact[] = raw.slices.flatMap((s) => s.facts);
  const knownFacts: ParsedFact[] = allRawFacts.map((f) => parseFact(f));

  const slices = raw.slices.map((s) => parseSlice(s, knownFacts));

  return {
    id: skillId,
    name: raw.project.name,
    description: raw.context.description,
    slices,
    interactionSlices: slices.filter((s) => s.kind === "interaction"),
    automationSlices: slices.filter((s) => s.kind === "automation"),
  };
}
