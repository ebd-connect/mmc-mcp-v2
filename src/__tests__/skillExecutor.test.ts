import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllSkills } from "../loader/skillLoader.js";
import { JsonFileDataStore } from "../engine/jobExecutor.js";
import { executeSkillTool } from "../engine/skillExecutor.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// src/__tests__ → src → project root
const ROOT = join(__dirname, "..", "..");

const skillsDir = join(ROOT, "skills");
const dataDir = join(ROOT, "data");

describe("skillExecutor — discount-skill integration", () => {
  it("Member user, high order value → discount 5", async () => {
    const skills = await loadAllSkills(skillsDir);
    const dataStore = new JsonFileDataStore(dataDir);
    const skill = skills.find((s) => s.id === "discount-skill");
    expect(skill).toBeDefined();

    const slice = skill!.interactionSlices[0]!;
    const result = await executeSkillTool(
      skill!,
      slice,
      "test-tool",
      { customerId: "user-001", orderValue: 75 },
      dataStore
    );

    expect(result.success).toBe(true);
    expect(result.discount).toBe(5);
    expect(result.facts["customerTier"]).toBe("Member");
  });

  it("VIP user → discount 10 regardless of order value", async () => {
    const skills = await loadAllSkills(skillsDir);
    const dataStore = new JsonFileDataStore(dataDir);
    const skill = skills.find((s) => s.id === "discount-skill")!;
    const slice = skill.interactionSlices[0]!;

    const result = await executeSkillTool(
      skill,
      slice,
      "test-tool",
      { customerId: "user-002", orderValue: 10 },
      dataStore
    );

    expect(result.success).toBe(true);
    expect(result.discount).toBe(10);
    expect(result.facts["customerTier"]).toBe("VIP");
  });

  it("Guest user (no customerId) → discount 0", async () => {
    const skills = await loadAllSkills(skillsDir);
    const dataStore = new JsonFileDataStore(dataDir);
    const skill = skills.find((s) => s.id === "discount-skill")!;
    const slice = skill.interactionSlices[0]!;

    const result = await executeSkillTool(
      skill,
      slice,
      "test-tool",
      { customerId: "", orderValue: 100 },
      dataStore
    );

    expect(result.success).toBe(true);
    expect(result.discount).toBe(0);
    expect(result.facts["customerTier"]).toBe("Guest");
  });

  it("Member user, low order value → discount 0", async () => {
    const skills = await loadAllSkills(skillsDir);
    const dataStore = new JsonFileDataStore(dataDir);
    const skill = skills.find((s) => s.id === "discount-skill")!;
    const slice = skill.interactionSlices[0]!;

    const result = await executeSkillTool(
      skill,
      slice,
      "test-tool",
      { customerId: "user-001", orderValue: 30 },
      dataStore
    );

    expect(result.success).toBe(true);
    expect(result.discount).toBe(0);
    expect(result.facts["customerTier"]).toBe("Member");
  });

  it("produces expected active outcomes", async () => {
    const skills = await loadAllSkills(skillsDir);
    const dataStore = new JsonFileDataStore(dataDir);
    const skill = skills.find((s) => s.id === "discount-skill")!;
    const slice = skill.interactionSlices[0]!;

    const result = await executeSkillTool(
      skill,
      slice,
      "test-tool",
      { customerId: "user-001", orderValue: 75 },
      dataStore
    );

    expect(result.activeOutcomes).toContain("Discount requested");
    expect(result.activeOutcomes).toContain("Customer tier validated");
    expect(result.activeOutcomes).toContain("Member discount calculated");
  });
});
