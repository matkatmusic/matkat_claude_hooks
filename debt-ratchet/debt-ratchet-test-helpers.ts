import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export const ARRAY_DEBT_DIR = mkdtempSync(`${tmpdir()}/debt-ratchet-ledgers-`);

export const DEBT_SETTINGS = {
  CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR: ARRAY_DEBT_DIR,
  CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_MAX_AGE_MS: "604800000",
  CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES: "150",
  CLAUDE_HOOKS_DEBT_RATCHET_DEBT_TARGET: "0",
  CLAUDE_HOOKS_DEBT_RATCHET_FIX_BATCH_SIZE: "10",
};

export const DEBT_LIMITS = { maxFileLines: 150, debtTarget: 0, fixBatchSize: 10 };

export const ESLINT_CONFIG = `
export default [
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name=/^(map|filter|reduce|forEach|flatMap|some|every|find|findIndex)$/]',
          message: 'Use a for loop that pushes into a named result array.',
        },
      ],
    },
  },
];
`;

export const STYLISTIC_ESLINT_CONFIG = `
import stylistic from '@stylistic/eslint-plugin';
export default [
  {
    files: ['**/*.ts'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/brace-style': ['error', 'stroustrup'],
    },
  },
];
`;

export function setUpRepo(headSource: string): string {
  const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-`);
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
  writeFileSync(`${dir}/eslint.config.js`, ESLINT_CONFIG);
  writeFileSync(`${dir}/subject.ts`, headSource);
  writeFileSync(`${dir}/subject.test.ts`, "export const check = 1;\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
  return dir;
}

export function writeTranscript(dir: string, filePath: string): string {
  const path = `${dir}/transcript.jsonl`;
  const lines = [
    JSON.stringify({ type: "user", message: { content: "add a helper" } }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Edit", input: { file_path: filePath } }],
      },
    }),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

export function executeHook(input: object): string {
  const run = spawnSync("node", [`${import.meta.dirname}/debt-ratchet.ts`], {
    input: JSON.stringify({ settings: DEBT_SETTINGS, ...input }),
    encoding: "utf8",
  });
  return run.stdout.trim();
}
