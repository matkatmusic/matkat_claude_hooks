import { spawnSync } from "node:child_process";
import { getSessionStatePath, readSessionState } from "../shared/session-state.ts";

export type StatusInput = {
  model?: { id: string; display_name?: string };
  effort?: { level: "low" | "medium" | "high" | "xhigh" | "max" };
  workspace?: { current_dir?: string };
  session_id?: string;
  context_window?: {
    used_percentage?: number;
    // total_input_tokens?: number; // per-turn snapshot, not session total; see sessionTokens total_output_tokens?: number;
  };
  transcript_path?: string;
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number | string };
    seven_day?: { used_percentage?: number; resets_at?: number | string };
  };
  prompt_cache?: { warm?: boolean; expires_at?: number | null };
};

export type Sitting = { turns?: number; tokensIn?: number; tokensOut?: number };

// async function readSittings(sessionId: string | undefined): Promise<Sitting[]> {
//   if (!sessionId)
//     return [];
//   try {
//     const path = `${process.env.HOME}/.claude/turn-counters/${sessionId}.counter`;
//     const parsed = JSON.parse(await Bun.file(path).text());
//     return Array.isArray(parsed) ? parsed : [];
//   }
//   catch {
//     return [];
//   }
// }
export function readSittings(pathOrSessionId: string | undefined): Sitting[] {
  if (!pathOrSessionId)
    return [];
  const path = getSessionStatePath(pathOrSessionId);
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
