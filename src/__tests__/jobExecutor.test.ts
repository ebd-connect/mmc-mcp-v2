import { describe, it, expect } from "vitest";
import { executeJob, type DataStore } from "../engine/jobExecutor.js";
import { FactStore } from "../engine/factStore.js";
import type { ParsedJob } from "../types/skill.js";

const JOB: ParsedJob = {
  collection: "users",
  findTemplate: "{{CustomerId}}",
  mappings: { customertier: "{{user.tier}}" },
  cursorName: "user",
};

const MOCK_STORE: DataStore = {
  async findOne(collection, id) {
    if (collection !== "users") return null;
    const db: Record<string, unknown>[] = [
      { id: "user-001", tier: "Member" },
      { id: "user-002", tier: "VIP" },
    ];
    return db.find((r) => r["id"] === id) ?? null;
  },
};

// Known fact camelNames — mirrors what the skill loader would supply
const KNOWN_CAMEL_NAMES = ["customerId", "orderValue", "customerTier", "discount"];

describe("executeJob", () => {
  it("returns found=true and mapped tier for known user", async () => {
    const store = new FactStore();
    store.set("customerId", "user-001");
    const result = await executeJob(JOB, store, MOCK_STORE, KNOWN_CAMEL_NAMES);
    expect(result.found).toBe(true);
    expect(result.mappings["customerTier"]).toBe("Member");
  });

  it("returns found=true and VIP tier for VIP user", async () => {
    const store = new FactStore();
    store.set("customerId", "user-002");
    const result = await executeJob(JOB, store, MOCK_STORE, KNOWN_CAMEL_NAMES);
    expect(result.found).toBe(true);
    expect(result.mappings["customerTier"]).toBe("VIP");
  });

  it("returns found=false for unknown user", async () => {
    const store = new FactStore();
    store.set("customerId", "user-999");
    const result = await executeJob(JOB, store, MOCK_STORE);
    expect(result.found).toBe(false);
  });

  it("returns found=false when customerId is empty", async () => {
    const store = new FactStore();
    store.set("customerId", "");
    const result = await executeJob(JOB, store, MOCK_STORE);
    expect(result.found).toBe(false);
  });

  it("returns found=false when customerId not set", async () => {
    const store = new FactStore();
    const result = await executeJob(JOB, store, MOCK_STORE);
    expect(result.found).toBe(false);
  });
});
