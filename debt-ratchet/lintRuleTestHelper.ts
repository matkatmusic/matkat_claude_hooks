import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ESLINT_BIN = resolve(import.meta.dirname, "..", "node_modules", ".bin", "eslint");
const ESLINT_CONFIG = resolve(import.meta.dirname, "eslint.config.js");

export type LintMessage = { ruleId: string | null; line: number; message: string };

export function scanSourceText(relativeFilePath: string, sourceText: string): LintMessage[] {
  const dir = realpathSync(mkdtempSync(`${tmpdir()}/lint-rule-`));
  const filePath = `${dir}/${relativeFilePath}`;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, sourceText);
  const result = spawnSync(ESLINT_BIN, ["--config", ESLINT_CONFIG, "--format", "json", "--no-warn-ignored", filePath], { cwd: dir, encoding: "utf8" });
  if (result.error)
    throw result.error;
  const report = JSON.parse(result.stdout);
  return report[0].messages;
}

export function listMessagesWithRuleId(messages: LintMessage[], ruleId: string): LintMessage[] {
  const matching: LintMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const hasRuleId = messages[i].ruleId === ruleId;
    if (hasRuleId)
      matching.push(messages[i]);
  }
  return matching;
}

export function listMessagesWithText(messages: LintMessage[], text: string): LintMessage[] {
  const matching: LintMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const hasText = messages[i].message.includes(text);
    if (hasText)
      matching.push(messages[i]);
  }
  return matching;
}
