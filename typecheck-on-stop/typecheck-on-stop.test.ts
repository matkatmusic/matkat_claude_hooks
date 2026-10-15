#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

function writeTranscript(dir: string, filePath: string): string {
  const path = `${dir}/transcript.jsonl`;
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

function runHook(input: object, maxErrorLines: string = "20"): string {
  const run = spawnSync("node", [`${import.meta.dirname}/typecheck-on-stop.ts`], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES: maxErrorLines },
  });
  return run.stdout.trim();
}

function setUpProject(fileName: string, source: string): { cwd: string; transcript_path: string } {
  const cwd = mkdtempSync(`${tmpdir()}/typecheck-on-stop-`);
  writeFileSync(`${cwd}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["*.ts"] }));
  writeFileSync(`${cwd}/${fileName}`, source);
  const transcript_path = writeTranscript(cwd, `${cwd}/${fileName}`);
  return { cwd, transcript_path };
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
