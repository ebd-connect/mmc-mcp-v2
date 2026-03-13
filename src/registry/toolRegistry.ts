import type { ParsedSkill, ParsedSlice, ToolDefinition, ExecutionResult } from "../types/skill.js";
import type { DataStore } from "../engine/jobExecutor.js";
import { executeSkillTool } from "../engine/skillExecutor.js";
import type { CapabilityRegistry } from "../capabilities/capability.js";
import type { EventStore } from "../engine/eventStore.js";

// ────────────────────────────────────────────────────────────
// Tool name helpers
// ────────────────────────────────────────────────────────────

function normalizePart(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-");
}

function buildToolName(skillId: string, sliceName: string, commandName: string): string {
  return [normalizePart(skillId), normalizePart(sliceName), normalizePart(commandName)].join("_");
}

// ────────────────────────────────────────────────────────────
// Schema generation
// ────────────────────────────────────────────────────────────

function buildInputSchema(slice: ParsedSlice): ToolDefinition["inputSchema"] {
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];

  for (const fact of slice.commandFacts ?? []) {
    const jsonType = fact.valueType === "Numeric" ? "number" : "string";
    properties[fact.camelName] = {
      type: jsonType,
      description: `${fact.name} (${fact.valueType})`,
    };
    if (!fact.isCalculated) {
      required.push(fact.camelName);
    }
  }

  return { type: "object", properties, required };
}

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────

interface RegisteredTool {
  definition: ToolDefinition;
  skillId: string;
  sliceId: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly skillMap = new Map<string, ParsedSkill>();

  constructor(
    private readonly skills: ParsedSkill[],
    private readonly dataStore: DataStore,
    private readonly capabilityRegistry?: CapabilityRegistry,
    private readonly eventStore?: EventStore
  ) {}

  buildAll(): void {
    for (const skill of this.skills) {
      this.skillMap.set(skill.id, skill);

      for (const slice of skill.interactionSlices) {
        if (!slice.commandName) continue;

        const name = buildToolName(skill.id, slice.name, slice.commandName);
        const description = `[${skill.name}] ${slice.commandName} — ${slice.name}`;

        const definition: ToolDefinition = {
          name,
          description,
          inputSchema: buildInputSchema(slice),
          skillId: skill.id,
          sliceId: slice.id,
        };

        this.tools.set(name, { definition, skillId: skill.id, sliceId: slice.id });
      }
    }
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ExecutionResult> {
    const registered = this.tools.get(name);
    if (!registered) {
      return {
        success: false,
        toolName: name,
        activeOutcomes: [],
        facts: {},
        error: `Tool not found: ${name}`,
      };
    }

    const skill = this.skillMap.get(registered.skillId);
    if (!skill) {
      return {
        success: false,
        toolName: name,
        activeOutcomes: [],
        facts: {},
        error: `Skill not found: ${registered.skillId}`,
      };
    }

    const slice = skill.interactionSlices.find((s) => s.id === registered.sliceId);
    if (!slice) {
      return {
        success: false,
        toolName: name,
        activeOutcomes: [],
        facts: {},
        error: `Slice not found: ${registered.sliceId}`,
      };
    }

    // Use the first Identifier-type fact value as the correlationId (e.g. customerId)
    const idFact = slice.commandFacts?.find((f) => f.valueType === "Identifier");
    const correlationId = (idFact ? String(args[idFact.camelName] ?? "") : "") || "anonymous";

    return executeSkillTool(
      skill, slice, name, args,
      this.dataStore, this.capabilityRegistry,
      this.eventStore, correlationId
    );
  }
}
