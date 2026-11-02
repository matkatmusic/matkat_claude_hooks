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

test("allows read-only -o flags", () => {
  assert.equal(isBashContentWrite("curl -s -o /dev/null -w '%{http_code}' https://example.com"), false);
  assert.equal(isBashContentWrite("plutil -convert json -o - f.plist | jq ."), false);
  assert.equal(isBashContentWrite("ssh -o ConnectTimeout=10 host uptime"), false);
  assert.equal(isBashContentWrite("ssh -o BatchMode=yes host ls"), false);
  assert.equal(isBashContentWrite("find . -name a -o -name b"), false);
  assert.equal(isBashContentWrite("git ls-files -o --exclude-standard"), false);
});

test("blocks -o flags that write a file", () => {
  assert.equal(isBashContentWrite("curl -o out.html https://x"), true);
  assert.equal(isBashContentWrite("gcc -o prog main.c"), true);
  assert.equal(isBashContentWrite("sort -o out.txt in.txt"), true);
});

test("allows paste -sd", () => {
  assert.equal(isBashContentWrite("ls | paste -sd, -"), false);
  assert.equal(isBashContentWrite("ps -o pid | paste -sd' ' | fold -w 200"), false);
});

test("blocks sd as a command", () => {
  assert.equal(isBashContentWrite("sd foo bar file.txt"), true);
  assert.equal(isBashContentWrite("echo hi && sd a b f"), true);
  assert.equal(isBashContentWrite("foo || sd a b f"), true);
  assert.equal(isBashContentWrite("foo; sd a b f"), true);
  assert.equal(isBashContentWrite("echo $(sd a b f)"), true);
});

test("allows commands that do not write file content", () => {
  assert.equal(isBashContentWrite("rm f"), false);
  assert.equal(isBashContentWrite("mv a b"), false);
  assert.equal(isBashContentWrite("mkdir d"), false);
  assert.equal(isBashContentWrite("ls 2>&1"), false);
  assert.equal(isBashContentWrite("cmd > /dev/null"), false);
  assert.equal(isBashContentWrite('git commit -m "a > b"'), false);
});
