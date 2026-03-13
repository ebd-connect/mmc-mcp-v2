import { toCamelCase } from "../engine/expressionNormalizer.js";
import type { Capability, CapabilityContext, CapabilityResult } from "./capability.js";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Resolve a {{FactName}} template using the current fact store. */
function resolveTemplate(template: string, ctx: CapabilityContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const value = ctx.factStore.get(toCamelCase(name));
    return value !== undefined ? String(value) : "";
  });
}

/** Resolve a {{cursor.field}} mapping template against a retrieved document. */
function resolveMapping(
  template: string,
  document: Record<string, unknown>,
  cursorName: string
): unknown {
  // Simple scalar case: single template token — return typed value
  const singleMatch = template.match(/^\{\{([^}]+)\}\}$/);
  if (singleMatch) {
    const path = singleMatch[1]!;
    const parts = path.split(".");
    const [first, ...rest] = parts;
    let value: unknown = first === cursorName ? document : document[first ?? ""];
    for (const key of rest) {
      if (value !== null && typeof value === "object") {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return value;
  }

  // Mixed string: replace all tokens with their string form
  return template.replace(/\{\{([^}]+)\}\}/g, (_m, path: string) => {
    const parts = path.split(".");
    const [first, ...rest] = parts;
    let value: unknown = first === cursorName ? document : document[first ?? ""];
    for (const key of rest) {
      if (value !== null && typeof value === "object") {
        value = (value as Record<string, unknown>)[key];
      } else {
        return "";
      }
    }
    return value !== undefined ? String(value) : "";
  });
}

/**
 * Normalise a mapping key against the skill's known camelNames
 * to fix casing differences (e.g. "customertier" → "customerTier").
 */
function normaliseKey(rawKey: string, knownCamelNames: string[]): string {
  const camel = toCamelCase(rawKey);
  return knownCamelNames.find((n) => n.toLowerCase() === camel.toLowerCase()) ?? camel;
}

// ────────────────────────────────────────────────────────────
// json:read
// ────────────────────────────────────────────────────────────

/**
 * Looks up a single record in a JSON collection by its `id` field (or any field
 * specified via a `{{Template}}` in the `find` param) and maps document fields
 * into the fact store via the `mappings` param.
 *
 * Required params:
 *   - `collection`  string   — collection name, e.g. "users"
 *   - `find`        string   — ID value or `{{FactName}}` template to resolve
 *   - `mappings`    object   — { targetFactKey: "{{cursor.field}}" }
 *   - `cursorName`  string   — variable name for the found document (default "item")
 */
export const jsonReadCapability: Capability = {
  name: "json:read",
  description:
    "Looks up a record in a JSON collection by ID and maps fields into the fact store.",

  async execute(
    params: Record<string, unknown>,
    ctx: CapabilityContext
  ): Promise<CapabilityResult> {
    const collection = params["collection"] as string;
    const findParam = params["find"] as string;
    const mappings = (params["mappings"] ?? {}) as Record<string, string>;
    const cursorName = (params["cursorName"] as string | undefined) ?? "item";

    if (!collection || !findParam) {
      return { facts: {}, found: false };
    }

    // Resolve the find value from the fact store
    const findValue = resolveTemplate(findParam, ctx);
    if (!findValue) {
      return { facts: {}, found: false };
    }

    const document = await ctx.dataStore.findOne(collection, findValue);
    if (!document) {
      return { facts: {}, found: false };
    }

    // Apply mappings
    const facts: Record<string, unknown> = {};
    for (const [rawKey, template] of Object.entries(mappings)) {
      const key = normaliseKey(rawKey, ctx.knownCamelNames);
      facts[key] = resolveMapping(template, document, cursorName);
    }

    return { facts, found: true };
  },
};

// ────────────────────────────────────────────────────────────
// json:write
// ────────────────────────────────────────────────────────────

/**
 * Upserts a record into a JSON collection.
 *
 * Required params:
 *   - `collection`  string    — collection name, e.g. "orders"
 *
 * Optional params:
 *   - `mappings`    object    — { field: "{{FactName}}" } — resolved from fact store
 *   - `data`        object    — static fields merged into the record
 *   - `idField`     string    — field used as the upsert key (default "id")
 *
 * Returns `{ written: true }` on success.
 */
export const jsonWriteCapability: Capability = {
  name: "json:write",
  description: "Upserts a record into a JSON collection from current facts.",

  async execute(
    params: Record<string, unknown>,
    ctx: CapabilityContext
  ): Promise<CapabilityResult> {
    const collection = params["collection"] as string;
    const mappings = (params["mappings"] ?? {}) as Record<string, string>;
    const staticData = (params["data"] ?? {}) as Record<string, unknown>;
    const idField = (params["idField"] as string | undefined) ?? "id";

    if (!collection) {
      return { facts: { written: false }, found: false };
    }

    if (!ctx.dataStore.upsert) {
      throw new Error("json:write requires a DataStore that supports upsert()");
    }

    // Build the record: static data + resolved mappings
    const record: Record<string, unknown> = { ...staticData };
    for (const [rawKey, template] of Object.entries(mappings)) {
      const key = normaliseKey(rawKey, ctx.knownCamelNames);
      record[key] = resolveTemplate(template, ctx);
    }

    await ctx.dataStore.upsert(collection, record, idField);

    return { facts: { written: true }, found: true };
  },
};
