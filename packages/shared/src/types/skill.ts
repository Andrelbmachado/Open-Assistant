/** Skill (plugin) contracts. Loaded by @open-assistant/skills. */

export interface SkillAction {
  name: string;
  description: string;
  /** JSON Schema for the action input. */
  input: Record<string, unknown>;
  run(args: Record<string, unknown>, ctx: SkillContext): Promise<unknown>;
}

export interface SkillContext {
  /** Ask the user to approve a high-risk step. */
  requestApproval(reason: string): Promise<boolean>;
  log(message: string): void;
}

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  actions: SkillAction[];
  /** Permission scopes the skill needs (e.g. "fs.read", "net", "shell"). */
  permissions: string[];
  /** Other tools/skills this skill relies on. */
  requiredTools?: string[];
  /** Minimum model capability, if any. */
  modelRequirements?: { tools?: boolean; vision?: boolean };
}
