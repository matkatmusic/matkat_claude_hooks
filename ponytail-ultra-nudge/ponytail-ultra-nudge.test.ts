#!/usr/bin/env node
import { after, test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isPonytailUltraInTranscript, isPonytailUltraSkillCall, isPonytailUltraTypedPrompt } from "./ponytail-ultra-nudge.ts";

const typedLine = (commandName: string, args: string) =>
  JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: `<command-message>ponytail</command-message>\n<command-name>${commandName}</command-name>\n<command-args>${args}</command-args>`,
    },
  });

const skillLine = (skill: string, args: string) =>
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill, args } }] },
  });

test("typed command ultra", () => {
  assert.equal(isPonytailUltraInTranscript(typedLine("/ponytail:ponytail", "ultra")), true);
});

test("typed command full", () => {
  assert.equal(isPonytailUltraInTranscript(typedLine("/ponytail:ponytail", "full")), false);
});

test("typed command with args that only contain the word ultra does not count", () => {
  assert.equal(isPonytailUltraInTranscript(typedLine("/ponytail:ponytail", "not ultra")), false);
  assert.equal(isPonytailUltraInTranscript(typedLine("/ponytail:ponytail", "ultrasonic")), false);
});

test("short typed command name counts", () => {
  assert.equal(isPonytailUltraInTranscript(typedLine("/ponytail", "ultra")), true);
});

test("Skill tool call with ultra args counts", () => {
  assert.equal(isPonytailUltraInTranscript(skillLine("ponytail:ponytail", "ultra")), true);
  assert.equal(isPonytailUltraInTranscript(skillLine("ponytail", "ultra")), true);
});

test("Skill tool call with other args or other skill does not count", () => {
  assert.equal(isPonytailUltraInTranscript(skillLine("ponytail:ponytail", "not ultra")), false);
  assert.equal(isPonytailUltraInTranscript(skillLine("ponytail:ponytail", "full")), false);
  assert.equal(isPonytailUltraInTranscript(skillLine("other:skill", "ultra")), false);
});

test("typed prompt forms", () => {
  assert.equal(isPonytailUltraTypedPrompt("/ponytail ultra"), true);
  assert.equal(isPonytailUltraTypedPrompt("/ponytail:ponytail ultra"), true);
  assert.equal(isPonytailUltraTypedPrompt("  /ponytail:ponytail   ULTRA  "), true);
  assert.equal(isPonytailUltraTypedPrompt("/ponytail not ultra"), false);
  assert.equal(isPonytailUltraTypedPrompt("/ponytail"), false);
  assert.equal(isPonytailUltraTypedPrompt("please use ultra"), false);
});

test("skill call helper", () => {
  assert.equal(isPonytailUltraSkillCall("Skill", { skill: "ponytail:ponytail", args: "ultra" }), true);
  assert.equal(isPonytailUltraSkillCall("Skill", { skill: "ponytail:ponytail" }), false);
  assert.equal(isPonytailUltraSkillCall("Bash", { skill: "ponytail:ponytail", args: "ultra" }), false);
});

const stateDir = mkdtempSync(`${tmpdir()}/ponytail-nudge-state-`);
after(() => rmSync(stateDir, { recursive: true, force: true }));

const runHook = (home: string, input: object) =>
  execFileSync("node", [`${import.meta.dirname}/ponytail-ultra-nudge.ts`], {
    input: JSON.stringify({ settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: stateDir }, ...input }),
  });

const readState = (session: string) => JSON.parse(readFileSync(`${stateDir}/${session}.json`, "utf8"));

test("state already marks ponytail ultra invoked: exits with no output, transcript is never read", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `no-such-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;
  writeFileSync(`${stateDir}/${sessionId}.json`, JSON.stringify({ ponytailUltraInvoked: true }));

  const output = runHook(home, { transcript_path: transcriptPath });
  rmSync(`${stateDir}/${sessionId}.json`);
  assert.equal(output.toString(), "");
});

test("transcript shows the typed ultra command: writes the state key", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `session-a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;
  writeFileSync(transcriptPath, `${typedLine("/ponytail:ponytail", "ultra")}\n`);

  runHook(home, { transcript_path: transcriptPath });
  const state = readState(sessionId);
  rmSync(`${stateDir}/${sessionId}.json`);
  assert.equal(state.ponytailUltraInvoked, true);
});

test("typed ultra prompt sets the flag on that same prompt, with no nudge", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `session-b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;
  writeFileSync(transcriptPath, "");

  const output = runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "/ponytail ultra" });
  const state = readState(sessionId);
  rmSync(`${stateDir}/${sessionId}.json`);
  assert.equal(output.toString(), "");
  assert.equal(state.ponytailUltraInvoked, true);
});

test("PostToolUse of an ultra Skill call sets the flag, with no output", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `session-c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;

  const output = runHook(home, {
    hook_event_name: "PostToolUse",
    transcript_path: transcriptPath,
    tool_name: "Skill",
    tool_input: { skill: "ponytail:ponytail", args: "ultra" },
  });
  const state = readState(sessionId);
  rmSync(`${stateDir}/${sessionId}.json`);
  assert.equal(output.toString(), "");
  assert.equal(state.ponytailUltraInvoked, true);
});

test("PostToolUse of a Skill call with not-ultra args does not set the flag", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `session-d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;

  const output = runHook(home, {
    hook_event_name: "PostToolUse",
    transcript_path: transcriptPath,
    tool_name: "Skill",
    tool_input: { skill: "ponytail:ponytail", args: "not ultra" },
  });
  const stateFileExists = existsSync(`${stateDir}/${sessionId}.json`);
  rmSync(`${stateDir}/${sessionId}.json`, { force: true });
  assert.equal(output.toString(), "");
  assert.equal(stateFileExists, false);
});

test("no ultra yet: nudges on every prompt", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `session-e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;
  writeFileSync(transcriptPath, "");

  const first = runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "hello" });
  const second = runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "again" });
  rmSync(`${stateDir}/${sessionId}.json`);
  assert.notEqual(first.toString(), "");
  assert.notEqual(second.toString(), "");
});

test("second prompt reads only the new part of the transcript", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `session-f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;
  const oldLine = `${typedLine("/ponytail:ponytail", "full")}\n`;
  writeFileSync(transcriptPath, oldLine);

  runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "one" });
  assert.equal(readState(sessionId).ponytailTranscriptOffset, Buffer.byteLength(oldLine));

  const ultraLine = `${typedLine("/ponytail:ponytail", "ultra")}\n`;
  writeFileSync(transcriptPath, ultraLine);
  writeFileSync(`${stateDir}/${sessionId}.json`, JSON.stringify({ ponytailTranscriptOffset: Buffer.byteLength(ultraLine) }));
  const output = runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "two" });
  assert.notEqual(output.toString(), "");
  assert.equal(readState(sessionId).ponytailUltraInvoked, undefined);

  appendFileSync(transcriptPath, `${skillLine("ponytail:ponytail", "ultra")}\n`);
  const lastOutput = runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "three" });
  const state = readState(sessionId);
  rmSync(`${stateDir}/${sessionId}.json`);
  assert.equal(lastOutput.toString(), "");
  assert.equal(state.ponytailUltraInvoked, true);
});

test("a half-written last line is read on the next prompt, not lost", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const sessionId = `session-g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcriptPath = `${home}/${sessionId}.jsonl`;
  const fullLine = skillLine("ponytail:ponytail", "ultra");
  writeFileSync(transcriptPath, fullLine.slice(0, 40));

  const first = runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "one" });
  assert.notEqual(first.toString(), "");

  writeFileSync(transcriptPath, `${fullLine}\n`);
  const second = runHook(home, { hook_event_name: "UserPromptSubmit", transcript_path: transcriptPath, prompt: "two" });
  const state = readState(sessionId);
  rmSync(`${stateDir}/${sessionId}.json`);
  assert.equal(second.toString(), "");
  assert.equal(state.ponytailUltraInvoked, true);
});
