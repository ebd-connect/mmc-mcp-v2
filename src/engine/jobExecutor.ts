import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedJob } from "../types/skill.js";
import type { FactStore } from "./factStore.js";
import { toCamelCase } from "./expressionNormalizer.js";

// ────────────────────────────────────────────────────────────
// DataStore interface — injectable, testable
// ────────────────────────────────────────────────────────────

export interface DataStore {
  findOne(collection: string, id: string): Promise<Record<string, unknown> | null>;
}

/**
 * File-based data store that loads JSON arrays from disk.
 * Each JSON file in `dataDir` is named `{collection}.json` and contains
 * an array of objects with an `id` field.
 */
export class JsonFileDataStore implements DataStore {
  private readonly cache = new Map<string, Record<string, unknown>[]>();

  constructor(private readonly dataDir: string) {}

  async findOne(collection: string, id: string): Promise<Record<string, unknown> | null> {
    if (!id) return null;

    let records = this.cache.get(collection);
    if (!records) {
      try {
        const raw = await readFile(join(this.dataDir, `${collection}.json`), "utf-8");
        records = JSON.parse(raw) as Record<string, unknown>[];
        this.cache.set(collection, records);
      } catch {
        return null;
      }
    }

    return records.find((r) => r["id"] === id) ?? null;
  }
}

// ────────────────────────────────────────────────────────────
// Template resolution
// ────────────────────────────────────────────────────────────

/**
 * Resolve a template string like "{{CustomerId}}" using the current fact store.
 * Returns the resolved string value, or empty string if the fact is not set.
 */
function resolveTemplate(template: string, factStore: FactStore): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = factStore.get(toCamelCase(name));
    return value !== undefined ? String(value) : "";
  });
}

/**
 * Resolve a mapping value template against the found document.
 * e.g. "{{user.tier}}" with cursorName "user" → document["tier"]
 */
function resolveMapping(
  template: string,
  document: Record<string, unknown>,
  cursorName: string
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const parts = path.split(".");
    // first part should be the cursorName — skip it, traverse the rest
    const [first, ...rest] = parts;
    let value: unknown = first === cursorName ? document : document[first ?? ""];
    for (const key of rest) {
      if (value !== null && typeof value === "object") {
        value = (value as Record<string, unknown>)[key];
      } else {
        value = undefined;
        break;
      }
    }
    return value !== undefined ? String(value) : "";
  });
}

// ────────────────────────────────────────────────────────────
// Public executor
// ────────────────────────────────────────────────────────────

export interface JobResult {
  /** Resolved mapping key → value pairs, keys normalised to camelCase */
  mappings: Record<string, string>;
  /** true if the DB found a document */
  found: boolean;
}

/**
 * Execute a ParsedJob: resolve the find template, query the data store,
 * apply mappings, and return the resolved key/value pairs.
 *
 * @param knownCamelNames Optional list of known fact camelNames from the skill,
 *   used to normalise mapping keys (e.g. "customertier" → "customerTier").
 */
export async function executeJob(
  job: ParsedJob,
  factStore: FactStore,
  dataStore: DataStore,
  knownCamelNames?: string[]
): Promise<JobResult> {
  const findValue = resolveTemplate(job.findTemplate, factStore);

  if (!findValue) {
    return { mappings: {}, found: false };
  }

  const document = await dataStore.findOne(job.collection, findValue);

  if (!document) {
    return { mappings: {}, found: false };
  }

  const resolved: Record<string, string> = {};
  for (const [rawKey, template] of Object.entries(job.mappings)) {
    const rawCamel = toCamelCase(rawKey);
    // Match against known fact camelNames case-insensitively so that
    // "customertier" (from JSON) resolves to the canonical "customerTier".
    const normalizedKey =
      knownCamelNames?.find((n) => n.toLowerCase() === rawCamel.toLowerCase()) ?? rawCamel;
    resolved[normalizedKey] = resolveMapping(template, document, job.cursorName);
  }

  return { mappings: resolved, found: true };
}
