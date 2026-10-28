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
