import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isBashCommandBlocked } from "./bash-block-pattern.ts";

test("isBashCommandBlocked: a redirect to a real file is blocked", () => {
  assert.equal(isBashCommandBlocked("echo hi > out.txt"), true);
});

test("isBashCommandBlocked: ls is allowed", () => {
  assert.equal(isBashCommandBlocked("ls"), false);
});

test("isBashCommandBlocked: a redirect into a .idleState folder is allowed", () => {
  assert.equal(isBashCommandBlocked("echo '{}' > /tmp/.idleState/x.json"), false);
});

test("isBashCommandBlocked: rg -o is allowed but sort -o file is blocked", () => {
  assert.equal(isBashCommandBlocked("rg -o foo | head -2"), false);
  assert.equal(isBashCommandBlocked("sort -o out.txt in"), true);
});

test("isBashCommandBlocked: read-only ps is allowed", () => {
  assert.equal(isBashCommandBlocked("ps -p 1234 -o pid,etime"), false);
  assert.equal(isBashCommandBlocked("ps aux"), false);
});

test("isBashCommandBlocked: read-only -o flags are allowed", () => {
  assert.equal(isBashCommandBlocked("curl -s -o /dev/null -w '%{http_code}' https://example.com"), false);
  assert.equal(isBashCommandBlocked("plutil -convert json -o - f.plist | jq ."), false);
  assert.equal(isBashCommandBlocked("ssh -o ConnectTimeout=10 host uptime"), false);
  assert.equal(isBashCommandBlocked("ssh -o BatchMode=yes host ls"), false);
  assert.equal(isBashCommandBlocked("find . -name a -o -name b"), false);
  assert.equal(isBashCommandBlocked("git ls-files -o --exclude-standard"), false);
});

test("isBashCommandBlocked: -o flags that write a file are blocked", () => {
  assert.equal(isBashCommandBlocked("curl -o out.html https://x"), true);
  assert.equal(isBashCommandBlocked("gcc -o prog main.c"), true);
  assert.equal(isBashCommandBlocked("sort -o out.txt in.txt"), true);
});

test("isBashCommandBlocked: paste -sd is allowed", () => {
  assert.equal(isBashCommandBlocked("ls | paste -sd, -"), false);
  assert.equal(isBashCommandBlocked("ps -o pid | paste -sd' ' | fold -w 200"), false);
});

test("isBashCommandBlocked: sd as a command is blocked", () => {
  assert.equal(isBashCommandBlocked("sd foo bar file.txt"), true);
  assert.equal(isBashCommandBlocked("echo hi && sd a b f"), true);
  assert.equal(isBashCommandBlocked("echo $(sd a b f)"), true);
});
