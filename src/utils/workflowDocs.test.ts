import { describe, expect, it } from "vitest";
import { buildWorkflow, NODE_KINDS, validateWorkflow } from "./workflow";
import skill from "../../src-tauri/skills/node-editor/SKILL.md?raw";
import docs from "../../docs/NODE_EDITOR.md?raw";

describe("node editor documentation", () => {
  it("documents every node kind in the skill and in docs/NODE_EDITOR.md", () => {
    for (const spec of NODE_KINDS) {
      expect(skill, spec.kind).toContain(`\`${spec.kind}\``);
      expect(docs, spec.kind).toContain(`\`${spec.kind}\``);
    }
  });

  it("every JSON example in the skill is a valid workflow", () => {
    const examples = [...skill.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
    expect(examples.length).toBeGreaterThanOrEqual(4);
    for (const example of examples) expect(validateWorkflow(buildWorkflow(example)), example.name).toEqual([]);
  });
});
