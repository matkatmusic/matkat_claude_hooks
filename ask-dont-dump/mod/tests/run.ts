import { readFileSync, writeFileSync, mkdirSync } from "fs";

/*
*   Usage by model:
*        claude-opus-5-5:  2.6k input, 24.3k output, 6.3m cache read, 209.2k cache write ($3.43)
*       claude-sonnet-5-5:  16.7k input, 24.9k output, 2.2m cache read, 164.1k cache write ($0.92)
*       claude-haiku-5-5:  247 input, 2.8k output, 141.1k cache read, 33.5k cache write ($0.0070)
*/


const OLD_PROMPT_COMMIT = "27dcbb2d18527df9043254a9d85959f7079dbbca";
const NEW_PROMPT_COMMIT = "bd6e59c3164ab8a645dc1a7594268a4dfe49ec86";
const PROMPT_PATH_IN_REPO = "ask-dont-dump/mod/ask-dont-dump-prompt.md";

const dir = import.meta.dir;

function git(args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd: dir });
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")} exit ${proc.exitCode}: ${proc.stderr.toString()}`);
  return proc.stdout.toString();
}

const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();

function loadPrompt(commit: string): string {
  const proc = Bun.spawnSync(["git", "show", `${commit}:${PROMPT_PATH_IN_REPO}`], { cwd: repoRoot });
  if (proc.exitCode !== 0) throw new Error(`git show ${commit} exit ${proc.exitCode}: ${proc.stderr.toString()}`);
  return proc.stdout.toString();
}

const samples: { id: string; expect: boolean; text: string }[] = JSON.parse(readFileSync(`${dir}/samples.json`, "utf8"));
const prompts: Record<string, string> = {
  OLD: loadPrompt(OLD_PROMPT_COMMIT),
  NEW: loadPrompt(NEW_PROMPT_COMMIT),
};

async function callModel(prompt: string): Promise<string> {
  const proc = Bun.spawn(
    ["claude", "-p", "--model", "claude-haiku-5-5", "--setting-sources", "", "--system-prompt", "You are a checker. Follow the prompt.", "--tools", "", "--no-session-persistence", "--disable-slash-commands"],
    { stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe", cwd: dir },
  );
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`exit ${code}: ${err}`);
  return out;
}

const startedAt = new Date().toISOString();
const all: any[] = [];
for (const version of ["OLD", "NEW"]) {
  for (const s of samples) {
    for (let run = 1; run <= 3; run++) {
      const hookInput = JSON.stringify({ last_assistant_message: s.text, stop_hook_active: false });
      const prompt = prompts[version].split("$ARGUMENTS").join(hookInput);
      const raw = await callModel(prompt);
      const verdict = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      all.push({ version, id: s.id, expect: s.expect, run, ok: verdict.ok, reason: verdict.reason, raw });
    }
  }
}
const finishedAt = new Date().toISOString();

const rows: string[] = [];
for (const s of samples) {
  let oldPasses = 0;
  let newPasses = 0;
  for (const r of all) {
    if (r.id !== s.id || r.ok !== true) continue;
    if (r.version === "OLD") oldPasses++;
    if (r.version === "NEW") newPasses++;
  }
  rows.push(`${s.id} | ${s.expect} | OLD ${oldPasses}/3 | NEW ${newPasses}/3`);
}

const resultsDir = `${dir}/results`;
mkdirSync(resultsDir, { recursive: true });
const timestamp = startedAt.slice(0, 19).replaceAll(":", "-");
const outPath = `${resultsDir}/${timestamp}.json`;
writeFileSync(outPath, JSON.stringify({ oldPromptCommit: OLD_PROMPT_COMMIT, newPromptCommit: NEW_PROMPT_COMMIT, startedAt, finishedAt, runs: all, summary: rows }, null, 2));
console.log(rows.join("\n"));
console.log(outPath);
