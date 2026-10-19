import { spawnSync } from "node:child_process";
import { getSessionStatePath, readSessionState } from "../shared/session-state.ts";

export type StatusInput = {
  model?: { id: string; display_name?: string };
  effort?: { level: "low" | "medium" | "high" | "xhigh" | "max" };
  workspace?: { current_dir?: string };
  session_id?: string;
  context_window?: {
    used_percentage?: number;
  };
  transcript_path?: string;
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number | string };
    seven_day?: { used_percentage?: number; resets_at?: number | string };
  };
  prompt_cache?: { warm?: boolean; expires_at?: number | null };
};

export type Sitting = { turns?: number; tokensIn?: number; tokensOut?: number };

export function readSittings(pathOrSessionId: string | undefined, stateDir: string): Sitting[] {
  if (!pathOrSessionId)
    return [];
  const path = getSessionStatePath(pathOrSessionId, stateDir);
  return readSessionState(path).sittings ?? [];
}

export function countTurns(sittings: Sitting[]): number {
  let total = 0;
  for (const sitting of sittings) {
    const hasTurns = sitting.turns !== undefined;
    if (hasTurns)
      total += sitting.turns!;
  }
  return total;
}

export function getSessionTokens(sittings: Sitting[]): { in: number; out: number } | undefined {
  const last = sittings[sittings.length - 1];
  return last ? { in: last.tokensIn ?? 0, out: last.tokensOut ?? 0 } : undefined;
}

export function getGitBranch(projectDir: string | undefined): string {
  const git = spawnSync("git", ["branch", "--show-current"], { cwd: projectDir });
  return git.status === 0 ? git.stdout.toString().trim() : "";
}
