import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { hasOpenDialog, inputBoxHoldsMessage } from "./teamFile.ts";

const SUBMIT_PASSES = 5;

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

  const typeCode = tmux_lib.tmux_sendKeys(pane, text);
  if (typeCode !== 0)
    throw new Error(`tmux could not type the text into pane ${pane}`);

  for (let pass = 0; pass < SUBMIT_PASSES; pass++) {
    tmux_lib.sleep(0.5);
    const screen = tmux_lib.tmux_capturePane(pane);
    if (hasOpenDialog(screen))
      throw new Error(`a dialog opened in "${chatName}" during the send`);
    if (!inputBoxHoldsMessage(screen, text))
      return;
    tmux_lib.tmux_sendEnter(pane);
    tmux_lib.sleep(1);
  }
  throw new Error(`the message to "${chatName}" was not submitted`);
}
