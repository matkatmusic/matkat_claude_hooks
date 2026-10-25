import { rename } from 'node:fs/promises';
import { HISTORY_PATH, loadHistory, type Version } from './playgroundHistory';

function buildFileStamp() {
  const isoTime = new Date().toISOString();
  const timeWithoutColons = isoTime.replaceAll(':', '-');
  return timeWithoutColons.replaceAll('.', '-');
}

function isPlainObject(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVersionShape(item: unknown) {
  if (!isPlainObject(item))
    return false;
  const { id, state, questions, calls, outputs } = item as Record<string, unknown>;
  return Number.isInteger(id) && isPlainObject(state) && isPlainObject(questions) && Number.isInteger(calls) && Array.isArray(outputs);
}

export async function executeSaveRequest() {
  const history = await loadHistory();
  const savePath = `${import.meta.dir}/results/playground-history-${buildFileStamp()}.json`;
  await Bun.write(savePath, JSON.stringify(history, null, 2) + '\n');
  return Response.json({ path: savePath });
}

export async function executeLoadRequest(request: Request) {
  const body = (await request.json()) as { versions?: unknown };
  const { versions } = body;
  const isVersionsNonEmptyArray = Array.isArray(versions) && versions.length > 0;
  if (!isVersionsNonEmptyArray)
    return new Response('versions must be a non-empty array', { status: 400 });
  for (const item of versions) {
    if (!isVersionShape(item))
      return new Response('each version needs an integer id, object state, object questions, integer calls, and array outputs', { status: 400 });
  }
  const archivePath = `${import.meta.dir}/results/playground-history-${buildFileStamp()}.json`;
  await rename(HISTORY_PATH, archivePath);
  await Bun.write(HISTORY_PATH, JSON.stringify(versions, null, 2) + '\n');
  return Response.json(versions);
}

export async function executeResetRunsRequest(request: Request) {
  const body = (await request.json()) as { id?: unknown };
  const { id } = body;
  const history = await loadHistory();
  let foundVersion: Version | undefined;
  for (const version of history) {
    if (version.id === id)
      foundVersion = version;
  }
  const isIdKnown = Number.isInteger(id) && foundVersion !== undefined;
  if (!isIdKnown)
    return new Response('id must be the integer id of an existing version', { status: 400 });
  (foundVersion as Version).outputs = [];
  (foundVersion as Version).calls = 0;
  (foundVersion as Version).note = '';
  await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
  return Response.json(foundVersion);
}
