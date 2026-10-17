#!/usr/bin/env node
import { readFileSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

const PUSH_KEYS_SCRIPT = "import os, fcntl, termios\nfd = os.open('/dev/tty', os.O_RDWR)\nfor key in b'world\\r':\n    fcntl.ioctl(fd, termios.TIOCSTI, bytes([key]))";

const input = JSON.parse(readFileSync(0, "utf8"));
const promptText = String(input.prompt);
const promptTrimmed = promptText.trim();
const promptIsHello = promptTrimmed === "hello";
if (promptIsHello) {
  // script goes in as $0 so its single quotes never clash with shell quoting
  spawn("sh", ["-c", 'sleep 2; python3 -I -c "$0"', PUSH_KEYS_SCRIPT], { stdio: "ignore" }).unref();
  appendFileSync("/tmp/key-push-probe.log", `${new Date().toISOString()} pushed world\n`);
  process.stdout.write(JSON.stringify({ systemMessage: "key-push-probe: pushing 'world' in 2s" }));
}
