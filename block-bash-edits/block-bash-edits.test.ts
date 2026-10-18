#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isBashContentWrite } from "../shared/bash-content-write.ts";
import { isBashEdit } from "./block-bash-edits.ts";

test("blocks a file descriptor redirect to a file", () => {
  assert.equal(isBashEdit("make 2> err.log"), true);
  assert.equal(isBashEdit("make 2>>err.log"), true);
});

test("blocks python inline code", () => {
  assert.equal(isBashEdit('python -c "open(1).write(2)"'), true);
  assert.equal(isBashEdit("python3 -c 'print(1)'"), true);
});

test("allows descriptor dups, dev null, and quoted text", () => {
  assert.equal(isBashEdit("ls 2>&1"), false);
  assert.equal(isBashEdit("make 2>/dev/null"), false);
  assert.equal(isBashEdit("make 2> /dev/null"), false);
  assert.equal(isBashEdit('git commit -m "run python -c and 2> x"'), false);
  assert.equal(isBashEdit("python script.py"), false);
});

test("blocks commands that write file content", () => {
  assert.equal(isBashContentWrite("cat > f.txt"), true);
  assert.equal(isBashContentWrite("cat <<EOF"), true);
  assert.equal(isBashContentWrite("sed -i s/a/b/ f"), true);
  assert.equal(isBashContentWrite("echo hi | tee f"), true);
});

test("allows commands that do not write file content", () => {
  assert.equal(isBashContentWrite("rm f"), false);
  assert.equal(isBashContentWrite("mv a b"), false);
  assert.equal(isBashContentWrite("mkdir d"), false);
  assert.equal(isBashContentWrite("ls 2>&1"), false);
  assert.equal(isBashContentWrite("cmd > /dev/null"), false);
  assert.equal(isBashContentWrite('git commit -m "a > b"'), false);
});
