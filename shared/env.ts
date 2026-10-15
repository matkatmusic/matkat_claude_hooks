import { resolve } from "node:path";

process.loadEnvFile(resolve(import.meta.dirname, "..", ".env"));

export function readEnvValue(name: string): string {
  const value = process.env[name];
  if (value === undefined)
    throw new Error(`claude_hooks requires ${name} to exist in .env: set ${name} in .env`);
  return value;
}
