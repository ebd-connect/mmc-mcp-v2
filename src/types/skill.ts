// ────────────────────────────────────────────────────────────
// Raw shapes — exactly as they appear in the .json files
// ────────────────────────────────────────────────────────────

export interface RawFact {
  id: string;
  name: string;
  valueType: string; // "Identifier" | "Numeric" | "Text" | ...
  testValue: string;
  defaultValue: string;
  collection: boolean;
  isCalculated?: boolean;
  expression?: string;
  calculatedValue?: string; // present on facts inside scenario then[] outcomes
}

export interface RawOutcome {
  id: string;
  name: string;
  role: string;
  outcomeStream: string;
  activity: { name: string };
  context: { name: string };
  facts: RawFact[];
}

export interface RawCommand {
  id: string;
  name: string;
  facts: RawFact[];
  outcomes: RawOutcome[];
}

export interface RawJob {
  id: string;
  name: string;
  collection: string; // e.g. "users"
  find: string; // e.g. "{{CustomerId}}"
  mappings: Record<string, string>; // e.g. { "customertier": "{{user.tier}}" }
  returnedFact: RawFact; // cursor name used in template resolution
}

export interface RawAutomation {
  id: string;
  name: string;
  facts: RawFact[];
  job?: RawJob;
}

export interface RawQuery {
  id: string;
  name: string;
  facts: RawFact[];
  outcomes: RawOutcome[];
}

export interface RawScenario {
  id: string;
  given: RawOutcome[];
  givenBusinessRule: string; // human prose — log only, never machine-evaluated
  when: RawCommand;
  whenBusinessRule: string; // evaluable JS expression (after normalization)
  then: RawOutcome[];
  error: string;
}

export interface RawSlice {
  id: string;
  name: string;
  role: string; // "customer" | "ai" | "system" | ""
  outcomes: RawOutcome[];
  command?: RawCommand;
  automation?: RawAutomation;
  queries?: RawQuery[];
  scenarios: RawScenario[];
  facts: RawFact[];
  outcomeStream: string;
  interface?: { id: string; name: string; facts: RawFact[] };
}

export interface RawSkill {
  project: { id: string; name: string; path: string };
  context: { id: string; name: string; description: string };
  outcomeModel: { id: string; name: string; description: string; kpis: unknown[]; systems: unknown[] };
  slices: RawSlice[];
  governance: {
    owner: string;
    status: string;
    version: string;
    lastUpdated: string;
    compliance: unknown[];
    visibility: string;
  };
  exportedAt: string;
  version: string;
}

// ────────────────────────────────────────────────────────────
// Parsed / classified shapes — produced by skillLoader
// ────────────────────────────────────────────────────────────

export type SliceKind = "interaction" | "automation" | "view";

export interface ParsedFact {
  id: string;
  name: string;
  camelName: string; // toCamelCase(name) — runtime key used in FactStore / expressions
  valueType: string;
  collection: boolean;
  isCalculated: boolean;
  calculatedValue?: string; // set when fact carries a hardcoded value in a then[]
}

export interface ParsedOutcome {
  id: string;
  name: string;
  facts: ParsedFact[];
}

export interface ParsedScenario {
  id: string;
  givenOutcomeIds: string[]; // IDs that must be in OutcomeTracker before this fires
  givenBusinessRule: string; // kept for logging / debugging
  whenExpression: string | null; // normalised JS expression, or null if empty
  thenOutcomes: ParsedOutcome[]; // outcomes to produce; facts carry calculatedValue
  errorMessage: string;
}

export interface ParsedJob {
  collection: string;
  findTemplate: string; // "{{CustomerId}}"
  mappings: Record<string, string>; // { "customertier": "{{user.tier}}" }
  cursorName: string; // "user" from returnedFact.name
}

export interface ParsedAutomation {
  id: string;
  name: string;
  job?: ParsedJob;
}

export interface ParsedSlice {
  id: string;
  name: string;
  kind: SliceKind;
  role: string;
  commandName?: string; // set for interaction slices
  commandFacts?: ParsedFact[]; // input facts for interaction slices
  producedOutcomes: ParsedOutcome[]; // outcomes this slice declares it produces
  automation?: ParsedAutomation;
  scenarios: ParsedScenario[];
}

export interface ParsedSkill {
  id: string; // derived from filename
  name: string;
  description: string;
  slices: ParsedSlice[];
  interactionSlices: ParsedSlice[];
  automationSlices: ParsedSlice[];
}

// ────────────────────────────────────────────────────────────
// Runtime shapes
// ────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string; // e.g. "discount-skill_request-return_request-discount"
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  skillId: string;
  sliceId: string;
}

export interface ExecutionResult {
  success: boolean;
  toolName: string;
  activeOutcomes: string[];
  facts: Record<string, unknown>;
  discount?: number;
  error?: string;
}
