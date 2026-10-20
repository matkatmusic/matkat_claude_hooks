#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";
import { isEnabled, getValues, getSetting, getHooks, readSettings } from "./settings.ts";

const DEFAULTS = {
  enablements: { alpha: { Stop: true, PreToolUse: false }, beta: { Stop: false } },
  values: { shared: { SHARED_KEY: "shared-default", OTHER: "other" }, alpha: { ALPHA_KEY: "alpha-default" }, beta: {} },
};

function makeDir(user?: object): string {
  const dir = mkdtempSync(`${tmpdir()}/settings-`);
  writeFileSync(`${dir}/dispatch.json`, JSON.stringify(DEFAULTS));
  if (user !== undefined)
    writeFileSync(`${dir}/user-dispatch.json`, JSON.stringify(user));
  return dir;
}

test("default only: values and enablements come from dispatch.json", () => {
  const settings = readSettings(makeDir());
  assert.equal(isEnabled(settings, "alpha", "Stop"), true);
  assert.equal(isEnabled(settings, "alpha", "PreToolUse"), false);
  assert.deepEqual(getValues(settings, "alpha"), { SHARED_KEY: "shared-default", OTHER: "other", ALPHA_KEY: "alpha-default" });
});

test("user override wins over the default", () => {
  const settings = readSettings(makeDir({ enablements: { alpha: { Stop: false } }, values: { alpha: { ALPHA_KEY: "alpha-user" } } }));
  assert.equal(isEnabled(settings, "alpha", "Stop"), false);
  assert.equal(getValues(settings, "alpha")["ALPHA_KEY"], "alpha-user");
});

test("a name with no values falls back to shared", () => {
  const settings = readSettings(makeDir({ enablements: {}, values: { shared: { SHARED_KEY: "shared-user" } } }));
  assert.deepEqual(getValues(settings, "beta"), { SHARED_KEY: "shared-user", OTHER: "other" });
});

test("an unknown name in user enablements throws", () => {
  const dir = makeDir({ enablements: { ghost: { Stop: true } }, values: {} });
  assert.throws(() => readSettings(dir), /ghost/);
});

test("an unknown name in user values throws", () => {
  const dir = makeDir({ enablements: {}, values: { phantom: { A: "b" } } });
  assert.throws(() => readSettings(dir), /phantom/);
});

test("a missing enablement throws and names the hook and event", () => {
  const settings = readSettings(makeDir());
  assert.throws(() => isEnabled(settings, "alpha", "SessionEnd"), /alpha.*SessionEnd/);
});

test("getSetting: a present key returns its value", () => {
  assert.equal(getSetting({ settings: { A_KEY: "a-value" } }, "A_KEY"), "a-value");
});

test("getSetting: a missing key throws and names the key", () => {
  assert.throws(() => getSetting({ settings: { A_KEY: "a-value" } }, "B_KEY"), /B_KEY/);
  assert.throws(() => getSetting({}, "B_KEY"), /B_KEY/);
});

test("getHooks resolves a relative script path against the dispatcher folder", () => {
  const dir = mkdtempSync(`${tmpdir()}/settings-`);
  const hooks = [
    { event: "Stop", command: ["node", "../a/a.ts"], timeout: 5 },
    { event: "Stop", command: ["node", "/abs/b.ts"] },
  ];
  writeFileSync(`${dir}/dispatch.json`, JSON.stringify({ ...DEFAULTS, hooks }));
  const resolved = getHooks(readSettings(dir));
  assert.deepEqual(resolved, [
    { event: "Stop", command: ["node", resolve(dir, "../a/a.ts")], timeout: 5 },
    { event: "Stop", command: ["node", "/abs/b.ts"] },
  ]);
});

test("user hooks are appended after the default hooks", () => {
  const dir = makeDir({ enablements: {}, values: {}, hooks: [{ event: "Stop", command: ["node", "../u/u.ts"] }] });
  writeFileSync(`${dir}/dispatch.json`, JSON.stringify({ ...DEFAULTS, hooks: [{ event: "Stop", command: ["node", "../a/a.ts"] }] }));
  const resolved = getHooks(readSettings(dir));
  assert.deepEqual(resolved, [
    { event: "Stop", command: ["node", resolve(dir, "../a/a.ts")] },
    { event: "Stop", command: ["node", resolve(dir, "../u/u.ts")] },
  ]);
});

test("a user-only hook name with its own enablement does not throw", () => {
  const dir = makeDir({
    enablements: { mine: { Stop: true } },
    values: { mine: { MINE_KEY: "x" } },
    hooks: [{ event: "Stop", command: ["node", "../mine/mine.ts"] }],
  });
  const settings = readSettings(dir);
  assert.equal(isEnabled(settings, "mine", "Stop"), true);
});

test("a value that starts with ../ resolves from the dispatcher folder", () => {
  const dispatcherDir = `${import.meta.dirname}/../dispatcher`;
  const settings = readSettings(makeDir({ enablements: {}, values: { alpha: { ALPHA_KEY: "../plan-file-reminder/planning.md" } } }));
  settings.dispatcherDir = dispatcherDir;
  assert.equal(getValues(settings, "alpha")["ALPHA_KEY"], resolve(`${import.meta.dirname}/..`, "plan-file-reminder/planning.md"));
});

test("a value that starts with ~/ gets the home folder", () => {
  const settings = readSettings(makeDir({ enablements: {}, values: { alpha: { ALPHA_KEY: "~/some/dir" } } }));
  assert.equal(getValues(settings, "alpha")["ALPHA_KEY"], `${homedir()}/some/dir`);
});
