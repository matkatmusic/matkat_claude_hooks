import { test } from "node:test";
import type { TestContext } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  listHandoffFilesInDirectories,
  writeHandoffDoneMarker,
  removeHandoffDoneMarker,
  writeSwapFailedMarker,
  isChatIdle,
} = await import("./chatSwap.ts");

const SESSION_ID = "abcdefgh-0000";

// Functions that reach tmux_lib.run or tmux_lib.sleep need Bun, so each one runs in a child process.
function runInBun(code: string) {
  return spawnSync("bun", ["-e", code], { encoding: "utf8", env: { ...process.env, BUN_JSC_useTailCalls: "0" }, cwd: join(import.meta.dirname, "..") });
}

function makeTemporaryFolder(): string {
  return mkdtempSync(join(tmpdir(), "claude-tmux-shared-"));
}

function startPane(t: TestContext, caseName: string, command: string[]): { pane: string; sessionName: string } {
  const sessionName = `chatSwap-test-${process.pid}-${caseName}`;
  const newSession = spawnSync("tmux", ["new-session", "-d", "-P", "-F", "#{pane_id}", "-s", sessionName, ...command], { encoding: "utf8" });
  assert.equal(newSession.status, 0, newSession.stderr);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", `=${sessionName}`]);
  });
  spawnSync("sleep", ["0.5"]);
  return { pane: newSession.stdout.trim(), sessionName };
}

function addBackgroundWindow(sessionName: string, command: string[]): string {
  const newWindow = spawnSync("tmux", ["new-window", "-d", "-P", "-F", "#{pane_id}", "-t", `=${sessionName}:`, ...command], { encoding: "utf8" });
  assert.equal(newWindow.status, 0, newWindow.stderr);
  return newWindow.stdout.trim();
}

function listAllPaneIds(): string[] {
  const paneList = spawnSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], { encoding: "utf8" });
  assert.equal(paneList.status, 0, paneList.stderr);
  return paneList.stdout.split("\n");
}

const fakeChatProgram = `
const fs = require("node:fs");
const [receivedFile, delayText, handoffFilePath] = process.argv.slice(2);
process.stdin.setRawMode(true);
process.stdout.write("\\x1b[?2004h❯ ");
let received = "";
fs.writeFileSync(receivedFile, received);
process.stdin.on("data", (chunk) => {
  const text = chunk.toString();
  received += text;
  fs.writeFileSync(receivedFile, received);
  if (text === "\\r") {
    fs.writeFileSync(handoffFilePath, "{}");
    process.stdout.write("\\r\\x1b[2K❯ ");
    return;
  }
  if (received.endsWith("\\x1b[201~"))
    setTimeout(() => process.stdout.write("\\r\\x1b[2K❯ [Pasted text #1 +59 lines]"), Number(delayText));
});
`;

function startFakeHandoffChat(t: TestContext, handoffFilePath: string): { pane: string; receivedFile: string } {
  // The fake chat shows the pasted text in its input box at once, and writes handoffFilePath when it gets Enter.
  const testFolder = makeTemporaryFolder();
  const receivedFile = join(testFolder, "received.txt");
  const programFile = join(testFolder, "fakeChat.cjs");
  writeFileSync(programFile, fakeChatProgram);
  const { pane } = startPane(t, "handoff", ["node", programFile, receivedFile, "0", handoffFilePath]);
  for (let waited = 0; waited < 50 && !existsSync(receivedFile); waited++)
    spawnSync("sleep", ["0.1"]);
  assert.equal(existsSync(receivedFile), true);
  spawnSync("sleep", ["0.5"]);
  return { pane, receivedFile };
}

test("test_listHandoffFilesInDirectories_returns_the_files_of_the_session_from_each_folder", () => {
  // Scenario: the files of the session are listed from every folder, first folder first. Files of other sessions are left out.
  // Step 1: make two folders. Each holds a file of session abcdefgh and a file of another session.
  const firstFolder = makeTemporaryFolder();
  const secondFolder = makeTemporaryFolder();
  for (const folder of [firstFolder, secondFolder]) {
    writeFileSync(`${folder}/2026-01-01-0000-abcdefgh.json`, "{}");
    writeFileSync(`${folder}/2026-01-01-0000-zzzzzzzz.json`, "{}");
  }
  // Step 2: list the files of session abcdefgh-0000 from both folders.
  const handoffFiles = listHandoffFilesInDirectories([firstFolder, secondFolder], SESSION_ID);
  // Step 3: the result is the two abcdefgh paths, first folder first.
  assert.deepEqual(handoffFiles, [`${firstFolder}/2026-01-01-0000-abcdefgh.json`, `${secondFolder}/2026-01-01-0000-abcdefgh.json`]);
});

test("test_listHandoffFilesInDirectories_skips_a_missing_folder", () => {
  // Scenario: a folder that does not exist gives no files and no error.
  // Step 1: make one real folder with one file of the session, and name one folder that does not exist.
  const realFolder = makeTemporaryFolder();
  writeFileSync(`${realFolder}/2026-01-01-0000-abcdefgh.json`, "{}");
  const missingFolder = join(makeTemporaryFolder(), "missing");
  // Step 2: list the files from both folders.
  const handoffFiles = listHandoffFilesInDirectories([missingFolder, realFolder], SESSION_ID);
  // Step 3: the result is the file of the real folder only.
  assert.deepEqual(handoffFiles, [`${realFolder}/2026-01-01-0000-abcdefgh.json`]);
});

test("test_waitForNewHandoffFile_returns_the_file_that_is_not_in_the_first_list", () => {
  // Scenario: the wait returns the one file that is new.
  // Step 1: make a folder with an old file and a new file. The first list holds only the old file.
  const idleFolder = makeTemporaryFolder();
  const oldFile = `${idleFolder}/2026-01-01-0000-abcdefgh.json`;
  const newFile = `${idleFolder}/2026-01-02-0000-abcdefgh.json`;
  writeFileSync(oldFile, "{}");
  writeFileSync(newFile, "{}");
  // Step 2: wait for a new file in a child process.
  const code = `import { waitForNewHandoffFile } from "./shared/chatSwap.ts"; console.log(JSON.stringify(waitForNewHandoffFile([${JSON.stringify(idleFolder)}], ${JSON.stringify(SESSION_ID)}, [${JSON.stringify(oldFile)}], "test chat", 30)));`;
  const wait = runInBun(code);
  // Step 3: the call succeeds and the result is the new path.
  assert.equal(wait.status, 0, wait.stderr);
  assert.equal(JSON.parse(wait.stdout.trim()), newFile);
});

test("test_waitForNewHandoffFile_throws_when_no_new_file_appears_in_time", () => {
  // Scenario: no new file appears, and the wait is 0 seconds.
  // Step 1: make a folder with one file. The first list holds that file.
  const idleFolder = makeTemporaryFolder();
  const onlyFile = `${idleFolder}/2026-01-01-0000-abcdefgh.json`;
  writeFileSync(onlyFile, "{}");
  // Step 2: wait for a new file with a wait of 0 seconds, in a child process.
  const code = `import { waitForNewHandoffFile } from "./shared/chatSwap.ts"; waitForNewHandoffFile([${JSON.stringify(idleFolder)}], ${JSON.stringify(SESSION_ID)}, [${JSON.stringify(onlyFile)}], "test chat", 0);`;
  const wait = runInBun(code);
  // Step 3: the call fails with the error that names the missing handoff file.
  assert.notEqual(wait.status, 0);
  assert.match(wait.stderr, /did not write a handoff file/);
});

test("test_sendHandoffCommandAndWaitForFile_returns_the_file_that_the_chat_writes_after_the_command", (t) => {
  // Scenario: the command goes to the chat, and the chat writes a handoff file after it gets Enter.
  // Step 1: make an empty idle folder, and start a fake chat that writes the handoff file when it gets Enter.
  const idleFolder = makeTemporaryFolder();
  const handoffFilePath = `${idleFolder}/2026-01-01-0000-abcdefgh.json`;
  const { pane, receivedFile } = startFakeHandoffChat(t, handoffFilePath);
  // Step 2: send the handoff command in a child process.
  const code = `import { sendHandoffCommandAndWaitForFile } from "./shared/chatSwap.ts"; console.log(JSON.stringify(sendHandoffCommandAndWaitForFile(${JSON.stringify(pane)}, "test chat", "/handoff-state", [${JSON.stringify(idleFolder)}], ${JSON.stringify(SESSION_ID)}, 1, 30)));`;
  const send = runInBun(code);
  // Step 3: the call succeeds and the result is the path that the chat wrote.
  assert.equal(send.status, 0, send.stderr);
  assert.equal(JSON.parse(send.stdout.trim()), handoffFilePath);
  // Step 4: the chat received the command.
  assert.ok(readFileSync(receivedFile, "utf8").includes("/handoff-state"));
});

test("test_writeHandoffDoneMarker_creates_the_marker_file_of_the_session", () => {
  // Scenario: the marker file of the session exists after the call.
  // Step 1: make an empty dispatcher folder.
  const dispatcherFolder = makeTemporaryFolder();
  // Step 2: write the marker of session sess-1.
  writeHandoffDoneMarker(dispatcherFolder, "sess-1");
  // Step 3: the marker file exists.
  assert.equal(existsSync(`${dispatcherFolder}/handoff-done/sess-1`), true);
});

test("test_removeHandoffDoneMarker_removes_the_marker_file_of_the_session", () => {
  // Scenario: the marker file is gone after the call.
  // Step 1: write the marker of session sess-1.
  const dispatcherFolder = makeTemporaryFolder();
  writeHandoffDoneMarker(dispatcherFolder, "sess-1");
  assert.equal(existsSync(`${dispatcherFolder}/handoff-done/sess-1`), true);
  // Step 2: remove the marker.
  removeHandoffDoneMarker(dispatcherFolder, "sess-1");
  // Step 3: the marker file is gone.
  assert.equal(existsSync(`${dispatcherFolder}/handoff-done/sess-1`), false);
});

test("test_removeHandoffDoneMarker_throws_when_the_marker_is_missing", () => {
  // Scenario: removing a marker that does not exist is an error.
  // Step 1: make an empty dispatcher folder with a handoff-done folder and no marker.
  const dispatcherFolder = makeTemporaryFolder();
  mkdirSync(`${dispatcherFolder}/handoff-done`);
  // Step 2 and 3: remove the marker. The call throws.
  assert.throws(() => removeHandoffDoneMarker(dispatcherFolder, "sess-1"));
});

test("test_writeSwapFailedMarker_creates_the_marker_file_of_the_session", () => {
  // Scenario: the swap-failed marker file of the session exists after the call.
  // Step 1: make an empty dispatcher folder.
  const dispatcherFolder = makeTemporaryFolder();
  // Step 2: write the swap-failed marker of session sess-1.
  writeSwapFailedMarker(dispatcherFolder, "sess-1");
  // Step 3: the marker file exists.
  assert.equal(existsSync(`${dispatcherFolder}/swap-failed/sess-1`), true);
});

test("test_isChatIdle_true_for_a_screen_with_an_empty_input_box", () => {
  // Scenario: a finished chat with an empty input box is idle.
  // Step 1 and 2: give the screen to isChatIdle.
  const isIdle = isChatIdle("✻ Worked for 2m 3s\n\n❯ \n");
  // Step 3: the answer is true.
  assert.equal(isIdle, true);
});

test("test_isChatIdle_false_for_a_busy_screen", () => {
  // Scenario: a chat that shows the busy line is not idle.
  // Step 1 and 2: give the screen to isChatIdle.
  const isIdle = isChatIdle("✻ Thinking… (12s · esc to interrupt)\n❯ \n");
  // Step 3: the answer is false.
  assert.equal(isIdle, false);
});

test("test_isChatIdle_false_when_the_input_box_holds_text", () => {
  // Scenario: a chat with text in its input box is not idle.
  // Step 1 and 2: give the screen to isChatIdle.
  const isIdle = isChatIdle("❯ fix the bug\n");
  // Step 3: the answer is false.
  assert.equal(isIdle, false);
});

test("test_waitForIdleChat_returns_for_an_idle_pane", (t) => {
  // Scenario: a pane that shows an empty input box is idle at once.
  // Step 1: start a pane that prints an empty input box and then waits.
  const { pane } = startPane(t, "idle", ["sh", "-c", "printf '❯ \\n'; sleep 60"]);
  // Step 2: wait for idle with 5 seconds, in a child process.
  const code = `import { waitForIdleChat } from "./shared/chatSwap.ts"; waitForIdleChat(${JSON.stringify(pane)}, "test chat", 5);`;
  const wait = runInBun(code);
  // Step 3: the call returns without an error.
  assert.equal(wait.status, 0, wait.stderr);
});

test("test_waitForIdleChat_throws_when_the_input_box_holds_text_after_the_wait", (t) => {
  // Scenario: a pane whose input box holds text never gets idle.
  // Step 1: start a pane that prints an input box with text and then waits.
  const { pane } = startPane(t, "holdsText", ["sh", "-c", "printf '❯ hello\\n'; sleep 60"]);
  // Step 2: wait for idle with 1 second, in a child process.
  const code = `import { waitForIdleChat } from "./shared/chatSwap.ts"; waitForIdleChat(${JSON.stringify(pane)}, "test chat", 1);`;
  const wait = runInBun(code);
  // Step 3: the call fails with the not idle error.
  assert.notEqual(wait.status, 0);
  assert.match(wait.stderr, /is not idle/);
});

test("test_closePaneIfOpen_closes_an_open_pane", (t) => {
  // Scenario: an open pane is closed.
  // Step 1: start a session with a first window, and add a second window with the pane to close.
  const { pane: keepPane, sessionName } = startPane(t, "closeOpen", ["sleep", "60"]);
  const paneToClose = addBackgroundWindow(sessionName, ["sleep", "60"]);
  assert.ok(listAllPaneIds().includes(paneToClose));
  // Step 2: close the pane in a child process.
  const code = `import { closePaneIfOpen } from "./shared/chatSwap.ts"; closePaneIfOpen(${JSON.stringify(paneToClose)});`;
  const close = runInBun(code);
  assert.equal(close.status, 0, close.stderr);
  // Step 3: the pane is gone, and the other pane is still open.
  const paneIdsAfter = listAllPaneIds();
  assert.equal(paneIdsAfter.includes(paneToClose), false);
  assert.equal(paneIdsAfter.includes(keepPane), true);
});

test("test_closePaneIfOpen_does_nothing_for_a_pane_that_does_not_exist", (t) => {
  // Scenario: a pane that does not exist is not an error.
  // Step 1: start a session, so that the tmux server runs.
  startPane(t, "closeMissing", ["sleep", "60"]);
  // Step 2: close the pane %999999 in a child process.
  const code = `import { closePaneIfOpen } from "./shared/chatSwap.ts"; closePaneIfOpen("%999999");`;
  const close = runInBun(code);
  // Step 3: the call returns without an error.
  assert.equal(close.status, 0, close.stderr);
});

test("test_selectWindowOfPane_makes_the_window_of_the_pane_active", (t) => {
  // Scenario: the window of the given pane becomes the active window.
  // Step 1: start a session with two windows. The first window is active.
  const { sessionName } = startPane(t, "selectWindow", ["sleep", "60"]);
  const secondWindowPane = addBackgroundWindow(sessionName, ["sleep", "60"]);
  const activeBefore = spawnSync("tmux", ["display-message", "-p", "-t", secondWindowPane, "#{window_active}"], { encoding: "utf8" });
  assert.equal(activeBefore.stdout.trim(), "0");
  // Step 2: select the window of the second pane in a child process.
  const code = `import { selectWindowOfPane } from "./shared/chatSwap.ts"; selectWindowOfPane(${JSON.stringify(secondWindowPane)});`;
  const select = runInBun(code);
  assert.equal(select.status, 0, select.stderr);
  // Step 3: the window of the second pane is active.
  const activeAfter = spawnSync("tmux", ["display-message", "-p", "-t", secondWindowPane, "#{window_active}"], { encoding: "utf8" });
  assert.equal(activeAfter.stdout.trim(), "1");
});
