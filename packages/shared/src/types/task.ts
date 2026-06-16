/** Tasks: one-time, recurring, and monitoring. */

export type TaskKind = "one_time" | "recurring" | "monitor";
export type TaskStatus = "scheduled" | "running" | "done" | "failed" | "paused";

export interface Schedule {
  /** Cron expression for recurring/monitor tasks. */
  cron?: string;
  /** ISO datetime for one-time tasks. */
  at?: string;
}

export interface TaskDefinition {
  id: string;
  kind: TaskKind;
  goal: string;
  schedule?: Schedule;
  /** For monitor tasks: condition expressed in natural language. */
  condition?: string;
  enabled: boolean;
}

export interface TaskRun {
  taskId: string;
  startedAt: number;
  finishedAt?: number;
  status: TaskStatus;
  output?: string;
  error?: string;
}
