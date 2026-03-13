import { DatabaseSync } from "node:sqlite";

export interface PersistedEvent {
  id: number;
  correlationId: string;
  skillId: string;
  sliceId: string;
  sliceName: string;
  outcomeId: string;
  outcomeName: string;
  facts: Record<string, unknown>;
  createdAt: string;
}

export class EventStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT NOT NULL,
        skill_id       TEXT NOT NULL,
        slice_id       TEXT NOT NULL,
        slice_name     TEXT NOT NULL,
        outcome_id     TEXT NOT NULL,
        outcome_name   TEXT NOT NULL,
        facts          TEXT NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_events_correlation ON events (correlation_id);
    `);
  }

  append(event: Omit<PersistedEvent, "id" | "createdAt">): void {
    this.db
      .prepare(
        `INSERT INTO events
           (correlation_id, skill_id, slice_id, slice_name, outcome_id, outcome_name, facts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.correlationId,
        event.skillId,
        event.sliceId,
        event.sliceName,
        event.outcomeId,
        event.outcomeName,
        JSON.stringify(event.facts)
      );
  }

  getByCorrelationId(correlationId: string): PersistedEvent[] {
    return (
      this.db
        .prepare(
          `SELECT id, correlation_id, skill_id, slice_id, slice_name,
                  outcome_id, outcome_name, facts, created_at
           FROM events WHERE correlation_id = ? ORDER BY id ASC`
        )
        .all(correlationId) as Array<Record<string, unknown>>
    ).map(this.mapRow);
  }

  getRecent(limit = 50): PersistedEvent[] {
    return (
      this.db
        .prepare(
          `SELECT id, correlation_id, skill_id, slice_id, slice_name,
                  outcome_id, outcome_name, facts, created_at
           FROM events ORDER BY id DESC LIMIT ?`
        )
        .all(limit) as Array<Record<string, unknown>>
    )
      .map(this.mapRow)
      .reverse();
  }

  private mapRow(row: Record<string, unknown>): PersistedEvent {
    return {
      id: row["id"] as number,
      correlationId: row["correlation_id"] as string,
      skillId: row["skill_id"] as string,
      sliceId: row["slice_id"] as string,
      sliceName: row["slice_name"] as string,
      outcomeId: row["outcome_id"] as string,
      outcomeName: row["outcome_name"] as string,
      facts: JSON.parse(row["facts"] as string) as Record<string, unknown>,
      createdAt: row["created_at"] as string,
    };
  }
}
