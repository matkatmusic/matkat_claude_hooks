// Bun runtime globals, declared locally so hooks need no node_modules.
declare const Bun: {
  stdin: { text(): Promise<string> };
  file(path: string): { text(): Promise<string> };
  write(path: string, data: string): Promise<number>;
  spawnSync(cmd: string[], opts?: { cwd?: string }): { stdout: { toString(): string }; exitCode: number };
  spawnSync(options: { cmd: string[]; argv0?: string; stdin?: string; stdout?: string; stderr?: string; env?: NodeJS.ProcessEnv }): Bun.SyncSubprocess;
  sleepSync(milliseconds: number): void;
  gunzipSync(data: Uint8Array): Uint8Array;
  serve(options: { port: number; fetch(request: Request): Promise<Response> }): void;
};
declare namespace Bun {
  type SyncSubprocess = { stdout: Uint8Array | undefined; stderr: Uint8Array | undefined; exitCode: number; signalCode?: string };
}

// Node globals and modules below are disabled: tsconfig now loads @types/node instead.
/*
declare const process: {
  exit(code: number): never;
  env: Record<string, string | undefined>;
};

declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void };

*/

interface ImportMeta {
  main: boolean;
}

/*
declare module "node:fs/promises" {
  export function mkdir(path: string, opts?: { recursive?: boolean }): Promise<string | undefined>;
  export function readdir(path: string): Promise<string[]>;
  export function stat(path: string): Promise<{ mtimeMs: number }>;
  export function unlink(path: string): Promise<void>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string): Promise<void>;
}

declare module "node:child_process" {
  export function spawnSync(
    cmd: string,
    args: string[],
    opts: { cwd: string; encoding: string; timeout: number; killSignal: string },
  ): { stdout: string; signal: string | null };
  export function execFileSync(
    cmd: string,
    args: string[],
    opts: { input: string; env: Record<string, string | undefined> },
  ): string;
}

declare module "node:fs" {
  export function readFileSync(pathOrFd: string | number, encoding: string): string;
  export function existsSync(path: string): boolean;
  export function writeFileSync(path: string, data: string): void;
  export function rmSync(path: string, opts?: { force?: boolean }): void;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
}

declare module "node:assert" {
  export const strict: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  };
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
*/
