import { rename } from 'node:fs/promises';
import { TypeSafeClient, type JsonValue, type Questions } from '@typesafe-ai/sdk';
import { createSeedHistory, HISTORY_PATH, loadHistory, type Version } from './playgroundHistory';

const MIN_CALLS = 1;
const MAX_CALLS = 10;

export async function executeRunRequest(request: Request) {
  // const body = (await request.json()) as { state?: unknown; questions?: unknown; calls?: unknown };
  // const { state, questions, calls } = body;
  const body = (await request.json()) as { id?: unknown; state?: unknown; questions?: unknown; calls?: unknown };
  const { id, state, questions, calls } = body;
  const isStateObject = typeof state === 'object' && state !== null && !Array.isArray(state);
  if (!isStateObject)
    return new Response('state must be a JSON object', { status: 400 });
  const isQuestionsObject = typeof questions === 'object' && questions !== null && !Array.isArray(questions);
  if (!isQuestionsObject)
    return new Response('questions must be a JSON object', { status: 400 });
  const isCallsValid = Number.isInteger(calls) && (calls as number) >= MIN_CALLS && (calls as number) <= MAX_CALLS;
  if (!isCallsValid)
    return new Response(`calls must be an integer from ${MIN_CALLS} to ${MAX_CALLS}`, { status: 400 });
  const history = await loadHistory();
  let shownVersion: Version | undefined;
  for (const version of history) {
    if (version.id === id)
      shownVersion = version;
  }
  const isIdKnown = Number.isInteger(id) && shownVersion !== undefined;
  if (!isIdKnown)
    return new Response('id must be the integer id of an existing version', { status: 400 });
  const client = new TypeSafeClient();
  const outputs: unknown[] = [];
  for (let i = 0; i < (calls as number); i++)
    outputs.push(await client.systemOne({ state: state as Record<string, JsonValue>, questions: questions as Questions }));
  // const history = await loadHistory();
  // const isOnlyEmptySeed = history.length === 1 && history[0].outputs.length === 0;
  // const id = isOnlyEmptySeed ? 1 : history.length + 1;
  // const version: Version = { id: history.length + 1, time: new Date().toISOString(), state, questions, calls: calls as number, outputs };
  // const version: Version = { id: history.length + 1, time: new Date().toISOString(), state, questions, calls: calls as number, outputs, note: '' };
  // const version: Version = { id, time: new Date().toISOString(), state, questions, calls: calls as number, outputs, note: '' };
  // history.push(version);
  // history[id - 1] = version;
  const isInputUnchanged = JSON.stringify(state) === JSON.stringify((shownVersion as Version).state) && JSON.stringify(questions) === JSON.stringify((shownVersion as Version).questions);
  if (isInputUnchanged) {
    (shownVersion as Version).outputs.push(...outputs);
    (shownVersion as Version).calls += calls as number;
    await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
    return Response.json(shownVersion);
  }
  const version: Version = { id: history.length + 1, time: new Date().toISOString(), state, questions, calls: calls as number, outputs, note: '' };
  history.push(version);
  await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
  return Response.json(version);
}

export async function executeNoteRequest(request: Request) {
  const body = (await request.json()) as { id?: unknown; note?: unknown };
  const { id, note } = body;
  const history = await loadHistory();
  let foundVersion: Version | undefined;
  for (const version of history) {
    if (version.id === id)
      foundVersion = version;
  }
  const isIdKnown = Number.isInteger(id) && foundVersion !== undefined;
  if (!isIdKnown)
    return new Response('id must be the integer id of an existing version', { status: 400 });
  const isNoteString = typeof note === 'string';
  if (!isNoteString)
    return new Response('note must be a string', { status: 400 });
  const isRunCompleted = (foundVersion as Version).outputs.length > 0;
  if (!isRunCompleted)
    return new Response('notes can only be added to a completed run', { status: 400 });
  (foundVersion as Version).note = note as string;
  await Bun.write(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
  return Response.json(foundVersion);
}

export async function executeResetRequest() {
  // const archivePath = `${import.meta.dir}/results/playground-history-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
  const isoTime = new Date().toISOString();
  const timeWithoutColons = isoTime.replaceAll(':', '-');
  const fileStamp = timeWithoutColons.replaceAll('.', '-');
  const archivePath = `${import.meta.dir}/results/playground-history-${fileStamp}.json`;
  await rename(HISTORY_PATH, archivePath);
  await createSeedHistory();
  return Response.json(await loadHistory());
}
