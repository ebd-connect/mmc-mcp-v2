import type { FactStore } from "../engine/factStore.js";
import type { DataStore } from "../engine/jobExecutor.js";

// ────────────────────────────────────────────────────────────
// Core interfaces
// ────────────────────────────────────────────────────────────

/**
 * Runtime context passed to every capability execution.
 */
export interface CapabilityContext {
  /** Mutable fact store for the current tool call. */
  factStore: FactStore;
  /** Data store providing collection access. */
  dataStore: DataStore;
  /**
   * All known fact camelNames from the skill definition.
   * Used by capabilities that need to normalise key casing (e.g. "customertier" → "customerTier").
   */
  knownCamelNames: string[];
}

/**
 * Result returned by a capability after execution.
 */
export interface CapabilityResult {
  /**
   * Facts to merge into the FactStore, keyed by camelName.
   * The skill executor applies these after the capability returns.
   */
  facts: Record<string, unknown>;
  /**
   * Whether the capability located a record (relevant for json:read).
   * The skill executor uses this to distinguish the guest / success path.
   */
  found?: boolean;
}

/**
 * A named, self-describing unit of execution that can be registered and invoked
 * by automation slices in a skill definition.
 *
 * Capabilities decouple *what* a skill wants to do (e.g. "look up a customer")
 * from *how* it is done (e.g. JSON file, HTTP API, in-memory cache).
 */
export interface Capability {
  /** Unique dot-namespaced name, e.g. "json:read", "http:post", "crm:lookup". */
  readonly name: string;
  /** Human-readable description shown in registry listings. */
  readonly description: string;
  /**
   * Execute the capability.
   * @param params  Raw params from the skill JSON (templates already resolved
   *                where needed, or left as-is for the capability to resolve).
   * @param ctx     Runtime context: fact store, data store, known camel names.
   */
  execute(params: Record<string, unknown>, ctx: CapabilityContext): Promise<CapabilityResult>;
}

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────

/**
 * Holds all registered capabilities and allows them to be looked up by name.
 *
 * Usage:
 * ```ts
 * const registry = new CapabilityRegistry()
 *   .register(jsonReadCapability, jsonWriteCapability)
 *   .register(myCustomCapability);
 * ```
 */
export class CapabilityRegistry {
  private readonly map = new Map<string, Capability>();

  /**
   * Register one or more capabilities.  Overwrites any existing registration
   * with the same name, allowing built-ins to be replaced at startup.
   */
  register(...capabilities: Capability[]): this {
    for (const cap of capabilities) {
      this.map.set(cap.name, cap);
    }
    return this;
  }

  /** Look up a capability by name. Returns `undefined` if not registered. */
  get(name: string): Capability | undefined {
    return this.map.get(name);
  }

  /** Return true if a capability with the given name is registered. */
  has(name: string): boolean {
    return this.map.has(name);
  }

  /** List all registered capabilities (for introspection / logging). */
  list(): Capability[] {
    return [...this.map.values()];
  }
}
