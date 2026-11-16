import { test } from "node:test";
import type { TestContext } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fakeChatProgram = `
const fs = require("node:fs");
const [receivedFile, delayText, enterClearDelayText] = process.argv.slice(2);
process.stdin.setRawMode(true);
process.stdout.write("\\x1b[?2004h❯ ");
let received = "";
let clearIsScheduled = false;
fs.writeFileSync(receivedFile, received);
process.stdin.on("data", (chunk) => {
  const text = chunk.toString();
  received += text;
  fs.writeFileSync(receivedFile, received);
  if (text === "\\r") {
    if (enterClearDelayText !== "0") {
      if (clearIsScheduled)
        return;
      clearIsScheduled = true;
      setTimeout(() => process.stdout.write("\\r\\x1b[2K❯ "), Number(enterClearDelayText));
      return;
    }
    process.stdout.write("\\r\\x1b[2K❯ ");
    return;
  }
  if (received.endsWith("\\x1b[201~")) {
    if (delayText !== "never")
      setTimeout(() => process.stdout.write("\\r\\x1b[2K❯ [Pasted text #1 +59 lines]"), Number(delayText));
  }
});
`;

function startFakeChat(t: TestContext, delayText: string, enterClearDelayText: string = "0"): { pane: string; receivedFile: string } {
  // The fake chat shows an input line with the pasted text marker after delayText milliseconds and clears the line enterClearDelayText milliseconds after the first Enter.
  const sessionName = `teamSend-test-${process.pid}-${delayText}-${enterClearDelayText}`;
  const testFolder = mkdtempSync(join(tmpdir(), "team-send-"));
  const receivedFile = join(testFolder, "received.txt");
  const programFile = join(testFolder, "fakeChat.cjs");
  writeFileSync(programFile, fakeChatProgram);
  const newSession = spawnSync("tmux", ["new-session", "-d", "-P", "-F", "#{pane_id}", "-s", sessionName, "node", programFile, receivedFile, delayText, enterClearDelayText],{ encoding: "utf8" });
  assert.equal(newSession.status, 0);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", `=${sessionName}`]);
  });
  for (let waited = 0; waited < 50 && !existsSync(receivedFile); waited++) {
    spawnSync("sleep", ["0.1"]);
  }
  assert.equal(existsSync(receivedFile), true);
  spawnSync("sleep", ["0.5"]);
  return { pane: newSession.stdout.trim(), receivedFile };
}

function sendToFakeChat(pane: string, text: string) {
  const sendCode = `import { sendTextToChat } from "./claude-team/teamSend.ts"; sendTextToChat(${JSON.stringify(pane)}, "test chat", ${JSON.stringify(text)}, 1);`;
  return spawnSync("bun", ["-e", sendCode], { encoding: "utf8", env: { ...process.env, BUN_JSC_useTailCalls: "0" }, cwd: join(import.meta.dirname, "..") });
}

test("test_sendTextToChat_pastes_a_long_text_that_starts_with_a_dash_as_one_bracketed_paste_and_presses_enter", (t) => {
  // Scenario: a long text reaches the pane whole, as one bracketed paste, and does not lose its head. Then Enter follows.
  // Step 1: start a fake chat that shows the text in its input line at once.
  const { pane, receivedFile } = startFakeChat(t, "0");
  // Step 2: send a text of 6,000 characters in 60 lines. The first line starts with "- ".
  const lines = ["- MARKER-START-7Q"];
  for (let lineNumber = 1; lineNumber < 60; lineNumber++) {
    lines.push(`line ${lineNumber} ${"x".repeat(90)}`);
  }
  const text = lines.join("\n");
  const send = sendToFakeChat(pane, text);
  assert.equal(send.status, 0, send.stderr);
  // Step 3: the pane gets the whole text between the two bracketed paste marks, then one Enter. tmux turns each new line into a carriage return.
  assert.equal(readFileSync(receivedFile, "utf8"), `\x1b[200~${text.replaceAll("\n", "\r")}\x1b[201~\r`);
});

test("test_sendTextToChat_presses_enter_when_the_text_shows_in_the_input_box_late", (t) => {
  // Scenario: the input box shows the text 1.5 seconds after the paste. The old code returned after 0.5 seconds without Enter.
  // Step 1: start a fake chat that shows the text after 1500 milliseconds.
  const { pane, receivedFile } = startFakeChat(t, "1500");
  // Step 2: send a short text. It must succeed.
  const send = sendToFakeChat(pane, "late text");
  assert.equal(send.status, 0, send.stderr);
  // Step 3: the pane got the paste and then one Enter.
  assert.equal(readFileSync(receivedFile, "utf8"), "\x1b[200~late text\x1b[201~\r");
});

test("test_sendTextToChat_waits_for_a_chat_that_takes_the_message_late", (t) => {
  // Scenario: the chat keeps the text in its input box for 15 seconds after the first Enter, because prompt hooks run first. The old code gave up after about 7.5 seconds.
  // Step 1: start a fake chat that shows the text at once, ignores more Enter presses, and clears the box 15000 milliseconds after the first Enter.
  const { pane } = startFakeChat(t, "0", "15000");
  // Step 2: send a short text and measure how long the call takes. It must succeed.
  const startedAt = Date.now();
  const send = sendToFakeChat(pane, "slow text");
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  assert.equal(send.status, 0, send.stderr);
  // Step 3: the call waited at least 12 seconds, so the wait really happened.
  assert.ok(elapsedSeconds >= 12, `the call took only ${elapsedSeconds} seconds`);
});

test("test_sendTextToChat_throws_when_the_text_never_shows_in_the_input_box", (t) => {
  // Scenario: the input box never shows the text.
  // Step 1: start a fake chat that never shows the text.
  const { pane, receivedFile } = startFakeChat(t, "never");
  // Step 2: send a short text. Check the error message and that no Enter was pressed.
  const send = sendToFakeChat(pane, "never shown");
  assert.notEqual(send.status, 0);
  assert.match(send.stderr, /the text did not appear in the input box of "test chat"/);
  assert.equal(readFileSync(receivedFile, "utf8"), "\x1b[200~never shown\x1b[201~");
});
