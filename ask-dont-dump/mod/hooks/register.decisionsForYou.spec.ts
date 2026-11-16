// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from "bun:test";
// @ts-ignore node:child_process has no types in this tsconfig
import { spawnSync } from "node:child_process";
import { REPLY_CHECKS, buildPrompt } from "./register";
import { parseYesPhrase } from "./nudgeFile";

const TIMEOUT_MS = 60000;
const QUESTION_OR_CHOICE_CHECK = REPLY_CHECKS[1];
// if (QUESTION_OR_CHOICE_CHECK === undefined)
//   throw new Error('REPLY_CHECKS has no second check');

function fetchHaikuReply(prompt: string): string {
  const proc = spawnSync(
    "claude",
    ["-p", "--model", "claude-haiku-5-5", "--setting-sources", "", "--system-prompt", "You are a reviewer of assistant replies, tasked with determining if the assistant's reply matches certain criteria. Follow the prompt.", "--tools", "", "--no-session-persistence", "--disable-slash-commands", "--output-format", "json"],
    { input: prompt, encoding: "utf8" },
  );
  if (proc.status !== 0)
    throw new Error(`exit ${proc.status}: ${proc.stderr}`);
  const envelope = JSON.parse(proc.stdout);
  return envelope.result;
}

function buildReplyWithList(heading: string): string {
  return [
    "I moved the helper into its own file and the test passes.",
    "",
    heading,
    "1. Keep the old file or remove it.",
    "2. Run the full suite now or later.",
  ].join("\n");
}

function checkReply(reply: string): { haikuText: string; phrase: string } {
  if (QUESTION_OR_CHOICE_CHECK === undefined)
    throw new Error('REPLY_CHECKS has no second check');
  const prompt = buildPrompt(QUESTION_OR_CHOICE_CHECK, reply, [], []);
  const haikuText = fetchHaikuReply(prompt);
  const phrase = parseYesPhrase(haikuText, reply);
  // @ts-ignore console has no types in this tsconfig
  console.log(`Haiku raw reply: ${JSON.stringify(haikuText)}`);
  return { haikuText, phrase };
}

test("test_decisions_for_you_list_is_flagged", () => {
  // Step 1: write a reply that reports done work, then ends with a "Decisions for you" list without any question mark.
  const reply = buildReplyWithList("**Decisions for you:**");
  // Step 2: ask real Haiku the question-or-choice check.
  const { phrase } = checkReply(reply);
  // Step 3: the mod must flag the reply.
  expect(phrase).not.toBe("");
}, TIMEOUT_MS);

test("test_choices_for_you_list_is_flagged", () => {
  // Step 1: write a reply that reports done work, then ends with a "Choices for you" list without any question mark.
  const reply = buildReplyWithList("Choices for you:");
  // Step 2: ask real Haiku the question-or-choice check.
  const { phrase } = checkReply(reply);
  // Step 3: the mod must flag the reply.
  expect(phrase).not.toBe("");
}, TIMEOUT_MS);

test("test_lowercase_decisions_for_you_list_is_flagged", () => {
  // Step 1: write a reply that reports done work, then ends with an all lowercase "decisions for you" list without any question mark.
  const reply = buildReplyWithList("decisions for you:");
  // Step 2: ask real Haiku the question-or-choice check.
  const { phrase } = checkReply(reply);
  // Step 3: the mod must flag the reply.
  expect(phrase).not.toBe("");
}, TIMEOUT_MS);

test("test_plain_done_reply_is_not_flagged", () => {
  // Step 1: write a plain reply with no question and no choice.
  const reply = "Done. The test passes.";
  // Step 2: ask real Haiku the question-or-choice check.
  const { phrase } = checkReply(reply);
  // Step 3: the mod must not flag the reply.
  expect(phrase).toBe("");
}, TIMEOUT_MS);
