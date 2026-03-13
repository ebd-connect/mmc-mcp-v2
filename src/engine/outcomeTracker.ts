import type { ParsedOutcome } from "../types/skill.js";

/**
 * Tracks which outcome IDs have been produced during a skill execution chain.
 * Used to check prerequisites (given[]) before triggering automation slices.
 */
export class OutcomeTracker {
  private readonly activeIds = new Set<string>();
  private readonly activeNames: string[] = [];

  produce(outcome: ParsedOutcome): void {
    if (!this.activeIds.has(outcome.id)) {
      this.activeIds.add(outcome.id);
      this.activeNames.push(outcome.name);
    }
  }

  /**
   * Returns true if ALL of the given outcome IDs are currently active.
   */
  hasAll(ids: string[]): boolean {
    return ids.every((id) => this.activeIds.has(id));
  }

  getActiveNames(): string[] {
    return [...this.activeNames];
  }

  getActiveIds(): Set<string> {
    return new Set(this.activeIds);
  }
}
