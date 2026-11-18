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

interface ImportMeta {
  main: boolean;
}
