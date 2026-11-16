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

test("test_sendTextToChat_waits_30_seconds_for_the_text_to_show_in_the_input_box", (t) => {
  // Scenario: a busy chat shows the pasted text in its input box only 30 seconds after the paste (120 polls of 0.25 seconds). The old code gave up after 5 seconds.
  // Step 1: start a fake chat that shows the text after 30000 milliseconds.
  const { pane, receivedFile } = startFakeChat(t, "30000");
  // Step 2: send a short text. It must succeed.
  const send = sendToFakeChat(pane, "busy text");
  assert.equal(send.status, 0, send.stderr);
  // Step 3: the pane got the paste and then one Enter.
  assert.equal(readFileSync(receivedFile, "utf8"), "\x1b[200~busy text\x1b[201~\r");
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

const fakeExitChatProgram = `
const fs = require("node:fs");
const [receivedFile, resultFile, helperDoneText, ignoresExit] = process.argv.slice(2);
const startedAt = Date.now();
const dialogScreen = "\\x1b[2J\\x1b[H" + [
  "Background work is running",
  "The following will stop when you exit:",
  "",
  "subagent · Apply blocked handoff steps",
  "",
  "❯ 1. Exit and stop tasks",
  "2. Move to background and exit",
  "3. Stay",
  "",
  "Enter to confirm · Esc to cancel",
].join("\\r\\n");
process.stdin.setRawMode(true);
process.stdout.write("\\x1b[?2004h❯ ");
let received = "";
let pendingInput = "";
let inDialog = false;
fs.writeFileSync(receivedFile, received);
function helperIsRunning() {
  if (helperDoneText === "never")
    return true;
  return Date.now() - startedAt < Number(helperDoneText);
}
process.stdin.on("data", (chunk) => {
  const text = chunk.toString();
  received += text;
  fs.writeFileSync(receivedFile, received);
  if (inDialog) {
    if (text === "\\x1b") {
      inDialog = false;
      process.stdout.write("\\x1b[2J\\x1b[H❯ ");
      return;
    }
    if (text === "\\r") {
      fs.writeFileSync(resultFile, "exited-with-stop");
      process.exit(0);
    }
    return;
  }
  if (text !== "\\r") {
    pendingInput += text;
    return;
  }
  const exitWasPasted = pendingInput.endsWith("\\x1b[200~/exit\\x1b[201~");
  pendingInput = "";
  if (!exitWasPasted)
    return;
  if (ignoresExit === "yes") {
    process.stdout.write("\\r\\x1b[2K❯ ");
    return;
  }
  if (helperIsRunning()) {
    inDialog = true;
    process.stdout.write(dialogScreen);
    return;
  }
  fs.writeFileSync(resultFile, "exited-clean");
  process.exit(0);
});
`;

let fakeExitChatCount = 0;

function startFakeExitChat(t: TestContext, helperDoneText: string, ignoresExit: string = "no"): { pane: string; receivedFile: string; resultFile: string } {
  // The fake chat has a background helper that finishes helperDoneText milliseconds after start ("never" and "0" mean never and no helper). With ignoresExit "yes" it ignores /exit.
  fakeExitChatCount++;
  const sessionName = `teamSendExit-test-${process.pid}-${fakeExitChatCount}`;
  const testFolder = mkdtempSync(join(tmpdir(), "team-send-exit-"));
  const receivedFile = join(testFolder, "received.txt");
  const resultFile = join(testFolder, "result.txt");
  const programFile = join(testFolder, "fakeExitChat.cjs");
  writeFileSync(programFile, fakeExitChatProgram);
  const newSession = spawnSync("tmux", ["new-session", "-d", "-P", "-F", "#{pane_id}", "-s", sessionName, "node", programFile, receivedFile, resultFile, helperDoneText, ignoresExit], { encoding: "utf8" });
  assert.equal(newSession.status, 0);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", `=${sessionName}`]);
  });
  for (let waited = 0; waited < 50 && !existsSync(receivedFile); waited++) {
    spawnSync("sleep", ["0.1"]);
  }
  assert.equal(existsSync(receivedFile), true);
  spawnSync("sleep", ["0.5"]);
  return { pane: newSession.stdout.trim(), receivedFile, resultFile };
}

function sendExitToFakeChat(pane: string, helperWaitSeconds: number, closeWaitSeconds: number) {
  const sendCode = `import { sendExitToChat } from "./claude-team/teamSend.ts"; sendExitToChat(${JSON.stringify(pane)}, "test chat", ${helperWaitSeconds}, ${closeWaitSeconds});`;
  return spawnSync("bun", ["-e", sendCode], { encoding: "utf8", env: { ...process.env, BUN_JSC_useTailCalls: "0" }, cwd: join(import.meta.dirname, "..") });
}

test("test_sendExitToChat_closes_a_chat_with_no_background_work", (t) => {
  // Scenario: a chat with no background helper closes when it gets /exit and Enter.
  // Step 1: start a fake chat with no helper.
  const { pane, resultFile } = startFakeExitChat(t, "0");
  // Step 2: close the chat with a helper wait of 5 seconds and a close wait of 20 seconds. It must succeed.
  const send = sendExitToFakeChat(pane, 5, 20);
  assert.equal(send.status, 0, send.stderr);
  // Step 3: the fake chat exited with no stop dialog.
  assert.equal(readFileSync(resultFile, "utf8"), "exited-clean");
});

test("test_sendExitToChat_waits_for_background_work_to_finish", (t) => {
  // Scenario: the helper finishes 5 seconds after start. The function must not stop the helper. It must press Escape and send /exit again.
  // Step 1: start a fake chat whose helper finishes after 5000 milliseconds.
  const { pane, resultFile } = startFakeExitChat(t, "5000");
  // Step 2: close the chat with a helper wait of 60 seconds and a close wait of 20 seconds. It must succeed.
  const send = sendExitToFakeChat(pane, 60, 20);
  assert.equal(send.status, 0, send.stderr);
  // Step 3: the fake chat exited clean, so nobody chose "Exit and stop tasks".
  assert.equal(readFileSync(resultFile, "utf8"), "exited-clean");
});

test("test_sendExitToChat_stops_tasks_after_the_helper_wait_limit", (t) => {
  // Scenario: the helper never finishes. After the helper wait, the function presses Enter on "Exit and stop tasks".
  // Step 1: start a fake chat whose helper never finishes.
  const { pane, resultFile } = startFakeExitChat(t, "never");
  // Step 2: close the chat with a helper wait of 3 seconds and a close wait of 20 seconds. It must succeed.
  const send = sendExitToFakeChat(pane, 3, 20);
  assert.equal(send.status, 0, send.stderr);
  // Step 3: the fake chat exited through the stop choice.
  assert.equal(readFileSync(resultFile, "utf8"), "exited-with-stop");
});

test("test_sendExitToChat_throws_when_the_chat_never_closes", (t) => {
  // Scenario: the chat ignores /exit, so the pane stays open past the helper wait plus the close wait.
  // Step 1: start a fake chat that ignores /exit.
  const { pane } = startFakeExitChat(t, "0", "yes");
  // Step 2: close the chat with a helper wait of 2 seconds and a close wait of 4 seconds. It must fail.
  const send = sendExitToFakeChat(pane, 2, 4);
  assert.notEqual(send.status, 0);
});
