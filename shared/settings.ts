import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, resolve } from "node:path";
// Reads dispatcher/dispatch.json (defaults) and dispatcher/user-dispatch.json (overrides).

export const DISPATCHER_DIR = `${import.meta.dirname}/../dispatcher`;

export type HookEntry = {
  event: string;
  matcher?: string;
  command: string[];
  timeout?: number;
};

export type Settings = {
  enablements: Record<string, Record<string, boolean>>;
  values: Record<string, Record<string, string>>;
  hooks: HookEntry[];
};

export function readSettings(dispatcherDir: string): { defaults: Settings; user: Settings; dispatcherDir: string } {
  const defaults: Settings = JSON.parse(readFileSync(`${dispatcherDir}/dispatch.json`, "utf8"));
  let user: Settings = { enablements: {}, values: {}, hooks: [] };
  const userPath = `${dispatcherDir}/user-dispatch.json`;
  const hasUserFile = existsSync(userPath);
  if (hasUserFile)
    user = JSON.parse(readFileSync(userPath, "utf8"));
  defaults.hooks ??= [];
  user.hooks ??= [];
  const userHookNames: string[] = [];
  for (const entry of user.hooks) {
    const scriptPath = entry.command[entry.command.length - 1];
    userHookNames.push(basename(scriptPath, extname(scriptPath)));
  }
  for (const name of Object.keys(user.enablements)) {
    const isKnown = name in defaults.enablements || userHookNames.includes(name);
    if (!isKnown)
      throw new Error(`user-dispatch.json enablements names unknown hook: ${name}`);
  }
  for (const name of Object.keys(user.values)) {
    const isKnown = name in defaults.values || userHookNames.includes(name);
    if (!isKnown)
      throw new Error(`user-dispatch.json values names unknown entry: ${name}`);
  }
  return { defaults, user, dispatcherDir };
}

export function getHooks(settings: { defaults: Settings; user: Settings; dispatcherDir: string }): HookEntry[] {
  const hooks: HookEntry[] = [];
  for (const entries of [settings.defaults.hooks, settings.user.hooks]) {
    for (const entry of entries) {
      const command = [...entry.command];
      const lastIndex = command.length - 1;
      const hasAbsolutePath = isAbsolute(command[lastIndex]);
      if (!hasAbsolutePath)
        command[lastIndex] = resolve(settings.dispatcherDir, command[lastIndex]);
      hooks.push({ ...entry, command });
    }
  }
  return hooks;
}

export function isEnabled(settings: { defaults: Settings; user: Settings }, name: string, event: string): boolean {
  const userValue = settings.user.enablements[name]?.[event];
  if (userValue !== undefined)
    return userValue;
  const defaultValue = settings.defaults.enablements[name]?.[event];
  if (defaultValue !== undefined)
    return defaultValue;
  throw new Error(`dispatch.json has no enablement for hook ${name} on event ${event}`);
}

export function getSetting(input: { settings?: Record<string, string> }, key: string): string {
  const value = input.settings?.[key];
  if (value === undefined)
    throw new Error(`dispatch.json has no value for ${key}`);
  return value;
}

export function getValues(settings: { defaults: Settings; user: Settings }, name: string): Record<string, string> {
  const merged: Record<string, string> = {
    ...settings.defaults.values["shared"],
    ...settings.user.values["shared"],
    ...settings.defaults.values[name],
    ...settings.user.values[name],
  };
  for (const key of Object.keys(merged)) {
    const value = merged[key];
    const hasHomePrefix = value.startsWith("~/");
    if (hasHomePrefix)
      merged[key] = homedir() + value.slice(1);
  }
  return merged;
}
