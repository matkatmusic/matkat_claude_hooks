// reflowComments joins wrapped prose, skips commented-out code. Run: node --test "*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReflowToFile, formatReflows, isRewriteNeeded, applyReflowToSource } from "./reflowComments.ts";
import { REWRITE_NOT_NEEDED } from "./resultCodes.ts";

const WRAPPED = [
  "// Nothing to say unless one of those files still has unstaged work. A porcelain",
  "// line's second column is the worktree status: space means staged-and-clean,",
  '// anything else (including "??") means the user still has staging to do.',
  "// Paths outside a git repo throw and count as clean — nothing to stage there.",
].join("\n");

const JOINED =
  "// Nothing to say unless one of those files still has unstaged work. A porcelain" +
  " line's second column is the worktree status: space means staged-and-clean," +
  ' anything else (including "??") means the user still has staging to do.' +
  "  Paths outside a git repo throw and count as clean — nothing to stage there.";

const COMMENTED_CODE = [
  "// process.stdout.write(JSON.stringify({",
  "//   hookSpecificOutput: {",
  '//     hookEventName: "Stop",',
  "//     additionalContext: `read ${instructionsPath}`,",
  "//   },",
  "// }));",
].join("\n");

test("wrapped prose collapses to one line, two spaces after a sentence", () => {
  const { text, runs } = applyReflowToSource(WRAPPED);
  assert.equal(text, JOINED);
  assert.deepEqual(runs, [{ start: 1, end: 4, line: 1, words: 51, joined: true, capped: true }]);
});

test("commented-out code is left exactly as written", () => {
  const { text, runs } = applyReflowToSource(COMMENTED_CODE);
  assert.equal(text, COMMENTED_CODE);
  assert.deepEqual(runs, []);
});

test("surrounding code and indentation survive, runs report shifted line numbers", () => {
  const source = [
    "const a = 1;",
    "  // a short wrapped",
    "  // comment here",
    "const b = 2;",
    "// second run that",
    "// also wraps",
  ].join("\n");
  const { text, runs } = applyReflowToSource(source);
  assert.equal(
    text,
    ["const a = 1;", "  // a short wrapped comment here", "const b = 2;", "// second run that also wraps"].join("\n"),
  );
  assert.deepEqual(runs.map((r) => [r.start, r.end, r.line]), [[2, 3, 2], [5, 6, 4]]);
});

test("a bare // is absorbed, so sentences split across it rejoin", () => {
  const source = ["// alone", "//", "// also alone"].join("\n");
  assert.equal(applyReflowToSource(source).text, "// alone also alone");
});

test("a ponytail: note is joined like prose but never flagged for truncation", () => {
  const source = [
    "// Consent gate for the two impure stages (script re-execution and git",
    "// shell-outs). Defaults ON so the CLI and tests behave exactly as before;",
    "// ponytail: process-wide switch, not per-call threading — builds are",
    "// synchronous, thread an options object through if that changes.",
    "let allowed = true;",
  ].join("\n");
  const { text, runs } = applyReflowToSource(source);
  assert.deepEqual(text.split("\n"), [
    "// Consent gate for the two impure stages (script re-execution and git shell-outs). Defaults ON so the CLI and tests behave exactly as before;",
    "// ponytail: process-wide switch, not per-call threading — builds are synchronous, thread an options object through if that changes.",
    "let allowed = true;",
  ]);
  assert.deepEqual(runs.map((r) => [r.line, r.joined, r.capped]), [[1, true, true], [2, true, false]]);

  const payload = JSON.parse(formatReflows([{ path: "/tmp/a.ts", runs }]));
  assert.deepEqual(payload.rewritten, [{ file: "/tmp/a.ts", lines: [1, 2] }]);
  assert.deepEqual(payload.files, [
    { path: "/tmp/a.ts", lines: [1], show: "nl -ba '/tmp/a.ts' | sed -n '1p'" },
  ]);
});

test("a long single-line ponytail: note is not reported at all", () => {
  const flat = `// ponytail: ${Array.from({ length: 25 }, (_, n) => `word${n}`).join(" ")}`;
  const { text, runs } = applyReflowToSource([flat, "const x = 1;"].join("\n"));
  assert.equal(text, [flat, "const x = 1;"].join("\n"));
  assert.deepEqual(runs, []);
});

test("an already-flat comment over the cap is reported but not rewritten", () => {
  const flat = `// ${Array.from({ length: 25 }, (_, n) => `word${n}`).join(" ")}`;
  const { text, runs } = applyReflowToSource([flat, "const x = 1;"].join("\n"));
  assert.equal(text, [flat, "const x = 1;"].join("\n"));
  assert.deepEqual(runs, [{ start: 1, end: 1, line: 1, words: 25, joined: false, capped: true }]);

  const payload = JSON.parse(formatReflows([{ path: "/tmp/a.ts", runs }]));
  assert.equal(payload.rewritten, undefined);
  assert.equal(payload.information, undefined);
  assert.deepEqual(payload.files, [
    { path: "/tmp/a.ts", lines: [1], show: "nl -ba '/tmp/a.ts' | sed -n '1p'" },
  ]);
});

test("a ---- divider ---- is passed through and ends the run above it", () => {
  const source = [
    "  // trailing prose of the",
    "  // previous section",
    "  // ---- task #251: content-driven ruler spacing ----------",
    "  // Any two CONSECUTIVE nodes of one widget are forced",
    "  // at least ROW_PX apart.",
  ].join("\n");
  const { text, runs } = applyReflowToSource(source);
  assert.deepEqual(text.split("\n"), [
    "  // trailing prose of the previous section",
    "  // ---- task #251: content-driven ruler spacing ----------",
    "  // Any two CONSECUTIVE nodes of one widget are forced at least ROW_PX apart.",
  ]);
  assert.deepEqual(runs.map((r) => [r.start, r.end, r.line]), [[1, 2, 1], [4, 5, 3]]);
});

test("a hyphenated word starting with a keyword is prose, not code", () => {
  const source = [
    "// Sole import: the counters module (itself",
    "// import-free), which tallies replay requests here",
    "// for those, this file and the real page already agree",
    "// class-based and type-safe callers are unaffected",
  ].join("\n");
  const { runs } = applyReflowToSource(source);
  assert.deepEqual(runs.map((r) => [r.start, r.end, r.joined]), [[1, 4, true]]);
});

test("real keyword lines are still detected as code", () => {
  for (const body of ["const x = 1;", "return;", "try {", "catch (e) {", "function(a)", "for (i = 0;"]) {
    const { runs } = applyReflowToSource([`// ${body}`, "// second line of the run"].join("\n"));
    assert.deepEqual(runs, [], `expected code: ${body}`);
  }
});

test("prose ending in a semicolon or paren is not mistaken for code", () => {
  const source = ["// Defaults ON so the CLI and tests behave exactly as before;", "// the viewer boots it OFF."].join("\n");
  const { runs } = applyReflowToSource(source);
  assert.deepEqual(runs.map((r) => r.joined), [true]);
});

test("single-line comments, blank lines, and directives are untouched", () => {
  const source = ["// eslint-disable-next-line no-console", "// because reasons", "", "// lone comment"].join("\n");
  assert.deepEqual(applyReflowToSource(source), { text: source, runs: [] });
});

test("mermaid %% comments are left unchanged", () => {
  const source = ["%% one idea", "%% split over two lines"].join("\n");
  assert.equal(applyReflowToSource(source).text, source);
});

test("mermaid %% lines are never joined", () => {
  const source =
    "%% Q_ABOUT --> Q_CHOICE_ABOUT_WORK --> Q_ABOUT_WORK_SCORE\n%% Q_ABOUT --> Q_CHOICE_ABOUT_CHECK --> Q_ABOUT_CHECK_SCORE\n%% old layer notes go here\n%% more notes on the same layer\n";
  assert.deepEqual(applyReflowToSource(source), { text: source, runs: [] });
});

test("a %% run does not absorb an adjacent // run", () => {
  const source = ["%% mermaid note", "// code note"].join("\n");
  assert.equal(applyReflowToSource(source).text, source);
});

test("describeReflows reports every rewritten line plus the over-cap ones", () => {
  const runs = [
    { start: 1, end: 2, line: 1, words: 40, joined: true, capped: true },
    { start: 9, end: 10, line: 8, words: 5, joined: true, capped: true },
  ];
  const payload = JSON.parse(formatReflows([{ path: "/tmp/a.ts", runs }]));
  assert.equal(payload.information, "the following lines were rewritten by a hook after your edit");
  assert.deepEqual(payload.rewritten, [{ file: "/tmp/a.ts", lines: [1, 8] }]);
  assert.match(payload.instruction, /under 20 words/);
  assert.deepEqual(payload.files, [
    { path: "/tmp/a.ts", lines: [1], show: "nl -ba '/tmp/a.ts' | sed -n '1p'" },
  ]);
});

test("all-short reflows report the rewrite but carry no instruction", () => {
  const runs = applyReflowToSource(["// a wrapped", "// short note"].join("\n")).runs;
  const payload = JSON.parse(formatReflows([{ path: "/tmp/a.ts", runs }]));
  assert.deepEqual(payload.rewritten, [{ file: "/tmp/a.ts", lines: [1] }]);
  assert.equal(payload.instruction, undefined);
  assert.equal(payload.files, undefined);
  assert.equal(isRewriteNeeded([{ path: "/tmp/a.ts", runs }]), REWRITE_NOT_NEEDED);
});

test("markdown files are skipped", () => {
  assert.deepEqual(applyReflowToFile("path.md"), []);
});

test("an active tackle-tasks worktree is skipped", () => {
  const tmp = mkdtempSync(join(tmpdir(), "reflow-"));
  const worktree = join(tmp, "task-1");
  mkdirSync(worktree);
  const file = join(worktree, "a.ts");
  writeFileSync(file, WRAPPED);
  writeFileSync(`${worktree}.lease`, JSON.stringify({ pid: 1, runId: "x" }));
  assert.deepEqual(applyReflowToFile(file), []);
  assert.equal(readFileSync(file, "utf8"), WRAPPED);
});

test("the show command lists every over-cap line in order", () => {
  const runs = [12, 40, 7].map((line) => ({ start: line, end: line + 1, line, words: 30, joined: true, capped: true }));
  const [file] = JSON.parse(formatReflows([{ path: "/a b/c.ts", runs }])).files;
  assert.equal(file.show, "nl -ba '/a b/c.ts' | sed -n '12p;40p;7p'");
});

test("a /** block is left exactly as written", () => {
  const source = ["/**", " * first line of a long doc comment that wraps", " * second line", " */"].join("\n");
  assert.deepEqual(applyReflowToSource(source), { text: source, runs: [] });
});

test("a /// run is left exactly as written", () => {
  const source = ["/// first line of a long doc comment that wraps", "/// second line"].join("\n");
  assert.deepEqual(applyReflowToSource(source), { text: source, runs: [] });
});
