import { loadHistory, HISTORY_PATH, createSeedHistory } from './playgroundHistory';
import { executeNoteRequest, executeResetRequest, executeRunRequest } from './playgroundRequests';
import { executeLoadRequest, executeResetRunsRequest, executeSaveRequest } from './playgroundVersionRequests';

const SERVER_HOSTNAME = '127.0.0.1';
const SERVER_PORT = 4318;

async function buildClientScript(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [`${import.meta.dir}/client/main.ts`],
    target: 'browser',
    format: 'esm',
    external: ['codemirror', '@codemirror/*', '@lezer/*'],
  });
  if (!result.success) {
    const logLines: string[] = [];
    for (const log of result.logs)
      logLines.push(log.message);
    throw new Error(`client build failed: ${logLines.join('\n')}`);
  }
  return result.outputs[0].text();
}

export async function buildPage() {
  const history = await loadHistory();
  const htmlFile = Bun.file(`${import.meta.dir}/page/playground.html`);
  const cssFile = Bun.file(`${import.meta.dir}/page/playground.css`);
  // const scriptFile = Bun.file(`${import.meta.dir}/page/playground.js`);
  const html = await htmlFile.text();
  const css = await cssFile.text();
  // const script = await scriptFile.text();
  const script = await buildClientScript();
  const safeJson = JSON.stringify({ versions: history }).replaceAll('<', '\\u003c');
  function getCss() {
    return css;
  }
  function getScript() {
    return script;
  }
  function getSafeJson() {
    return safeJson;
  }
  const withCss = html.replace('__PAGE_CSS__', getCss);
  const withScript = withCss.replace('__PAGE_SCRIPT__', getScript);
  return withScript.replace('__DATA_JSON__', getSafeJson);
}

if (import.meta.main) {
  const isHistoryPresent = await Bun.file(HISTORY_PATH).exists();
  if (!isHistoryPresent)
    await createSeedHistory();
  const server = Bun.serve({
    hostname: SERVER_HOSTNAME,
    port: SERVER_PORT,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const isRunPost = request.method === 'POST' && pathname === '/run';
      if (isRunPost)
        return executeRunRequest(request);
      const isNotePost = request.method === 'POST' && pathname === '/note';
      if (isNotePost)
        return executeNoteRequest(request);
      const isResetPost = request.method === 'POST' && pathname === '/reset';
      if (isResetPost)
        return executeResetRequest();
      const isSavePost = request.method === 'POST' && pathname === '/save';
      if (isSavePost)
        return executeSaveRequest();
      const isLoadPost = request.method === 'POST' && pathname === '/load';
      if (isLoadPost)
        return executeLoadRequest(request);
      const isResetRunsPost = request.method === 'POST' && pathname === '/reset-runs';
      if (isResetRunsPost)
        return executeResetRunsRequest(request);
      const isPageGet = request.method === 'GET' && pathname === '/';
      if (isPageGet)
        return new Response(await buildPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      return new Response('not found', { status: 404 });
    },
    error(error) {
      return new Response(error.message, { status: 500 });
    },
  });
  console.log(`http://${SERVER_HOSTNAME}:${server.port}/`);
}

// bun --watch claude/claude_hooks/ask-dont-dump/typesafe-playground/playground.ts
