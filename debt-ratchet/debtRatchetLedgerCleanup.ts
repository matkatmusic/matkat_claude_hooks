import { readdirSync, statSync, unlinkSync } from "node:fs";

// Deletes ledger files older than maxAgeMs from dir.
export function removeOldLedgers(dir: string, now: number, maxAgeMs: number): void {
  const files = readdirSync(dir);
  for (let i = 0; i < files.length; i++) {
    const path = `${dir}/${files[i]}`;
    const isOld = now - statSync(path).mtimeMs > maxAgeMs;
    if (isOld)
      unlinkSync(path);
  }
}
