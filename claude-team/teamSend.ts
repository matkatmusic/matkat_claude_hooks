import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { hasBackgroundWorkDialog, hasOpenDialog, inputBoxHoldsMessage } from "./teamFile.ts";

// const SUBMIT_PASSES = 5;
const SUBMIT_PASSES = 6;
const SUBMIT_WAIT_SECONDS = 10;
const APPEAR_POLL_SECONDS = 0.25;
// const APPEAR_POLLS = 20;
const APPEAR_POLLS = 240;
const EXIT_RETRY_SECONDS = 10;

export function sendTextToChat(pane: string, chatName: string, text: string, dialogWaitSeconds: number): void {
  let dialogIsOpen = true;
  for (let waitedSeconds = 0; waitedSeconds < dialogWaitSeconds; waitedSeconds++) {
    dialogIsOpen = hasOpenDialog(tmux_lib.tmux_capturePane(pane));
    if (!dialogIsOpen)
      break;
    tmux_lib.sleep(1);
  }
  if (dialogIsOpen)
    throw new Error(`the chat "${chatName}" has an open dialog`);

  const bufferName = `claude-team-${process.pid}`;
  tmux_lib.run(["tmux", "set-buffer", "-b", bufferName, "--", text], { capture_output: true, text: true, check: true });
  tmux_lib.run(["tmux", "paste-buffer", "-p", "-d", "-b", bufferName, "-t", pane], { capture_output: true, text: true, check: true });

  let textIsInInputBox = false;
  for (let poll = 0; poll < APPEAR_POLLS; poll++) {
    textIsInInputBox = inputBoxHoldsMessage(tmux_lib.tmux_capturePane(pane), text);
    if (textIsInInputBox)
      break;
    tmux_lib.sleep(APPEAR_POLL_SECONDS);
  }
  if (!textIsInInputBox)
    throw new Error(`the text did not appear in the input box of "${chatName}"`);

  // The old loop gave up after about 7.5 seconds.
  // for (let pass = 0; pass < SUBMIT_PASSES; pass++) {
  //   tmux_lib.sleep(0.5);
  //   const screen = tmux_lib.tmux_capturePane(pane);
  //   if (hasOpenDialog(screen))
  //     throw new Error(`a dialog opened in "${chatName}" during the send`);
  //   if (!inputBoxHoldsMessage(screen, text))
  //     return;
  //   tmux_lib.tmux_sendEnter(pane);
  //   tmux_lib.sleep(1);
  // }
  for (let pass = 0; pass < SUBMIT_PASSES; pass++) {
    tmux_lib.tmux_sendEnter(pane);
    for (let waitedSeconds = 0; waitedSeconds < SUBMIT_WAIT_SECONDS; waitedSeconds++) {
      tmux_lib.sleep(1);
      const screen = tmux_lib.tmux_capturePane(pane);
      if (hasOpenDialog(screen))
        throw new Error(`a dialog opened in "${chatName}" during the send`);
      if (!inputBoxHoldsMessage(screen, text))
        return;
    }
  }
  throw new Error(`the message to "${chatName}" was not submitted`);
}

export function sendExitToChat(pane: string, chatName: string, helperWaitSeconds: number, closeWaitSeconds: number): void {
  const startedAt = Date.now();
  let mustSendExit = true;
  let isPaneOpen = true;
  while (isPaneOpen) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (elapsedSeconds > helperWaitSeconds + closeWaitSeconds)
      throw new Error(`"${chatName}" did not close`);
    const paneListResult = tmux_lib.run(["tmux", "list-panes", "-a", "-F", "#{pane_id}"], { capture_output: true, text: true, check: true });
    isPaneOpen = paneListResult.stdout.split("\n").includes(pane);
    if (isPaneOpen) {
      const captureResult = tmux_lib.run(["tmux", "capture-pane", "-p", "-t", pane], { capture_output: true, text: true, check: false });
      const screen = captureResult.stdout;
      const isDialogOpen = hasBackgroundWorkDialog(screen);
      if (isDialogOpen) {
        const isHelperWaitOver = elapsedSeconds >= helperWaitSeconds;
        if (isHelperWaitOver) {
          tmux_lib.tmux_sendEnter(pane);
          tmux_lib.sleep(1);
        }
        else {
          tmux_lib.run(["tmux", "send-keys", "-t", pane, "Escape"], { capture_output: true, text: true, check: false });
          tmux_lib.sleep(EXIT_RETRY_SECONDS);
          mustSendExit = true;
        }
      }
      else {
        if (mustSendExit) {
          const bufferName = `claude-team-${process.pid}`;
          tmux_lib.run(["tmux", "set-buffer", "-b", bufferName, "--", "/exit"], { capture_output: true, text: true, check: true });
          tmux_lib.run(["tmux", "paste-buffer", "-p", "-d", "-b", bufferName, "-t", pane], { capture_output: true, text: true, check: false });
          tmux_lib.sleep(1);
          tmux_lib.tmux_sendEnter(pane);
          mustSendExit = false;
          tmux_lib.sleep(1);
        }
        else {
          const isExitStillInInputBox = inputBoxHoldsMessage(screen, "/exit");
          if (isExitStillInInputBox)
            tmux_lib.tmux_sendEnter(pane);
          tmux_lib.sleep(1);
        }
      }
    }
  }
}
