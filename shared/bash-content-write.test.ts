#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isBashContentWrite } from "./bash-content-write.ts";

test("blocks commands that write file content", () => {
  assert.equal(isBashContentWrite("cat > f.txt"), true);
  assert.equal(isBashContentWrite("cat <<EOF"), true);
  assert.equal(isBashContentWrite("sed -i s/a/b/ f"), true);
  assert.equal(isBashContentWrite("echo hi | tee f"), true);
});

test("blocks fd redirects to a file and python inline code", () => {
  assert.equal(isBashContentWrite("make 2> err.log"), true);
  assert.equal(isBashContentWrite("make 2>>err.log"), true);
  assert.equal(isBashContentWrite('python -c "open(1).write(2)"'), true);
  assert.equal(isBashContentWrite("python3 -c 'print(1)'"), true);
});

test("allows fd dups, dev null, quoted python text, and plain python scripts", () => {
  assert.equal(isBashContentWrite("make 2>/dev/null"), false);
  assert.equal(isBashContentWrite("make 2> /dev/null"), false);
  assert.equal(isBashContentWrite('git commit -m "run python -c and 2> x"'), false);
  assert.equal(isBashContentWrite("python script.py"), false);
});

test("allows commands that do not write file content", () => {
  assert.equal(isBashContentWrite("rm f"), false);
  assert.equal(isBashContentWrite("mv a b"), false);
  assert.equal(isBashContentWrite("mkdir d"), false);
  assert.equal(isBashContentWrite("ls 2>&1"), false);
  assert.equal(isBashContentWrite("cmd > /dev/null"), false);
  assert.equal(isBashContentWrite('git commit -m "a > b"'), false);
});
