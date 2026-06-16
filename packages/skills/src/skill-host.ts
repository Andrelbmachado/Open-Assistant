import type { SkillContext, SkillManifest } from "@open-assistant/shared";

/** Loads skills and exposes their actions to agents as callable tools. */
export class SkillHost {
  private skills = new Map<string, SkillManifest>();

  load(skill: SkillManifest): void {
    this.skills.set(skill.id, skill);
  }
  list(): SkillManifest[] {
    return [...this.skills.values()];
  }

  /** Resolve "skillId.actionName" and run it. */
  async invoke(
    qualifiedAction: string,
    args: Record<string, unknown>,
    ctx: SkillContext,
  ): Promise<unknown> {
    const [skillId, actionName] = qualifiedAction.split(".");
    const skill = this.skills.get(skillId);
    const action = skill?.actions.find((a) => a.name === actionName);
    if (!action) throw new Error(`Unknown action "${qualifiedAction}"`);
    // TODO: enforce skill.permissions before running.
    return action.run(args, ctx);
  }
}
