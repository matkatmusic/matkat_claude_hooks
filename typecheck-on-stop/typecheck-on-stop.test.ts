#!/usr/bin/env node
import { after, test } from "node:test";
import { strict as assert } from "node:assert";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";

const stateDir = mkdtempSync(`${tmpdir()}/typecheck-on-stop-state-`);
after(() => rmSync(stateDir, { recursive: true, force: true }));

function getBlockCountPath(transcriptPath: string): string {
  return `${stateDir}/typecheck-blocks-${basename(transcriptPath, ".jsonl")}.json`;
}

function writeTranscript(dir: string, filePath: string): string {
  // A unique transcript name per test folder gives each test its own block count file.
  const path = `${dir}/${basename(dir)}.jsonl`;
  const lines = [
    JSON.stringify({ type: "user", message: { content: "add a helper" } }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Edit", input: { file_path: filePath } }],
      },
    }),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

function runHook(input: { transcript_path: string; [key: string]: unknown }, maxErrorLines: string = "20", extraEnv: Record<string, string> = {}, keepsBlockCount: boolean = false): string {
  const run = spawnSync("node", [`${import.meta.dirname}/typecheck-on-stop.ts`], {
    input: JSON.stringify({ settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: stateDir, CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES: maxErrorLines }, ...input }),
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  if (!keepsBlockCount)
    rmSync(getBlockCountPath(input.transcript_path), { force: true });
  return run.stdout.trim();
}

function setUpProjectFiles(editedFileName: string, sources: Record<string, string>): { cwd: string; transcript_path: string } {
  const cwd = mkdtempSync(`${tmpdir()}/typecheck-on-stop-`);
  const compilerOptions = { strict: true, noEmit: true, jsx: "preserve" };
  writeFileSync(`${cwd}/tsconfig.json`, JSON.stringify({ compilerOptions, include: ["*.ts", "*.tsx"] }));
  const fileNames = Object.keys(sources);
  for (let i = 0; i < fileNames.length; i++)
    writeFileSync(`${cwd}/${fileNames[i]}`, sources[fileNames[i]]);
  const transcript_path = writeTranscript(cwd, `${cwd}/${editedFileName}`);
  return { cwd, transcript_path };
}

function setUpProject(fileName: string, source: string): { cwd: string; transcript_path: string } {
  return setUpProjectFiles(fileName, { [fileName]: source });
}

test("blocks the stop when an edited .ts file has a type error", () => {
  const { cwd, transcript_path } = setUpProject("bad.ts", 'const x: number = "a";\n');
  const output = runHook({ cwd, transcript_path, stop_hook_active: false });
  const parsed = JSON.parse(output);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /TS2322/);
});

test("allows the stop when the project type checks", () => {
  const { cwd, transcript_path } = setUpProject("good.ts", "const x: number = 1;\n");
  const output = runHook({ cwd, transcript_path, stop_hook_active: false });
  assert.equal(output, "");
});

test("keeps only as many error lines as the env limit allows", () => {
  const source = 'const a: number = "a";\nconst b: number = "b";\n';
  const { cwd, transcript_path } = setUpProject("two.ts", source);
  const output = runHook({ cwd, transcript_path, stop_hook_active: false }, "1");
  const parsed = JSON.parse(output);
  const errorCount = parsed.reason.split("\n").filter((line: string) => line.includes("error TS")).length;
  assert.equal(errorCount, 1);
});

test("blocks the stop when an edited .tsx file has a type error", () => {
  const { cwd, transcript_path } = setUpProject("bad.tsx", 'const x: number = "a";\n');
  const parsed = JSON.parse(runHook({ cwd, transcript_path, stop_hook_active: false }));
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /bad\.tsx/);
});

test("blocks the stop when an edited .mts file has a type error", () => {
  const cwd = mkdtempSync(`${tmpdir()}/typecheck-on-stop-`);
  writeFileSync(`${cwd}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["*.mts"] }));
  writeFileSync(`${cwd}/bad.mts`, 'const x: number = "a";\n');
  const transcript_path = writeTranscript(cwd, `${cwd}/bad.mts`);
  const parsed = JSON.parse(runHook({ cwd, transcript_path, stop_hook_active: false }));
  assert.equal(parsed.decision, "block");
});

test("does not block on errors in files that were not edited, and lists them as a note", () => {
  const { cwd, transcript_path } = setUpProjectFiles("good.ts", {
    "good.ts": "const x: number = 1;\n",
    "old.ts": 'const y: number = "old";\n',
  });
  const parsed = JSON.parse(runHook({ cwd, transcript_path, stop_hook_active: false }));
  assert.equal(parsed.decision, undefined);
  assert.match(parsed.systemMessage, /old\.ts/);
});

test("blocks on the edited file errors and lists the other file errors as a note", () => {
  const { cwd, transcript_path } = setUpProjectFiles("bad.ts", {
    "bad.ts": 'const x: number = "a";\n',
    "old.ts": 'const y: number = "old";\n',
  });
  const parsed = JSON.parse(runHook({ cwd, transcript_path, stop_hook_active: false }));
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /bad\.ts\(/);
  assert.match(parsed.reason, /old\.ts\(/);
});

test("reports the total error count even when the error lines are capped", () => {
  const source = 'const a: number = "a";\nconst b: number = "b";\nconst c: number = "c";\n';
  const { cwd, transcript_path } = setUpProject("three.ts", source);
  const parsed = JSON.parse(runHook({ cwd, transcript_path, stop_hook_active: false }, "1"));
  assert.match(parsed.reason, /3 errors/);
});

test("blocks loudly with stderr when tsc fails to start", () => {
  const { cwd, transcript_path } = setUpProject("good.ts", "const x: number = 1;\n");
  const fakeBin = mkdtempSync(`${tmpdir()}/typecheck-on-stop-bin-`);
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(`${fakeBin}/npx`, "#!/bin/sh\necho boom-from-fake-npx >&2\nexit 1\n");
  chmodSync(`${fakeBin}/npx`, 0o755);
  const env = { PATH: `${fakeBin}:${process.env.PATH}` };
  const parsed = JSON.parse(runHook({ cwd, transcript_path, stop_hook_active: false }, "20", env));
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /boom-from-fake-npx/);
});

function assertMissingHelperLogGetsEmptyLog(): void {
  const { cwd } = setUpProject("good.ts", "const x: number = 1;\n");
  const missingDir = `${cwd}/subagents`;
  const agent_transcript_path = `${missingDir}/agent-side-call.jsonl`;
  const run = spawnSync("node", [`${import.meta.dirname}/typecheck-on-stop.ts`], {
    input: JSON.stringify({ settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: stateDir, CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES: "20" }, cwd, agent_transcript_path, stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.equal(existsSync(missingDir), true);
  assert.equal(readFileSync(agent_transcript_path, "utf8"), "");
}
test("a subagent stop with no helper log makes an empty log and exits clean", assertMissingHelperLogGetsEmptyLog);

test("keeps blocking when stop_hook_active is true, and stops blocking after the limit", () => {
  const { cwd, transcript_path } = setUpProject("bad.ts", 'const x: number = "a";\n');
  const decisions: (string | undefined)[] = [];
  for (let i = 0; i < 6; i++) {
    const output = runHook({ cwd, transcript_path, stop_hook_active: true }, "20", {}, true);
    decisions.push(JSON.parse(output).decision);
  }
  rmSync(getBlockCountPath(transcript_path), { force: true });
  assert.equal(decisions[0], "block");
  assert.equal(decisions[1], "block");
  assert.notEqual(decisions[5], "block");
});
