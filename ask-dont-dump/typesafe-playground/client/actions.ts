import type { JsonValue, Questions } from '@typesafe-ai/sdk';
import type { NoteBody, RequestBody, ResetBody, RunBody, Version } from './types';
import { readTypedKey, updateSubmitAvailability } from './apiKey';
import { getButton, getElement, getInput, getTextArea } from './dom';
import { loadEditors } from './editors';
import { render } from './render';
import { getEditors, pageState } from './state';

export async function sendJson(path: string, body: RequestBody): Promise<Response> {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok)
    throw new Error('HTTP ' + response.status + ' ' + (await response.text()));
  return response;
}

export function moveBy(step: number): void {
  const count = pageState.versions.length;
  pageState.index = (pageState.index + step + count) % count;
  loadEditors();
  render();
}

export function moveToPrevious(): void {
  moveBy(-1);
}

export function moveToNext(): void {
  moveBy(1);
}

export function setPinnedToShown(): void {
  pageState.pinnedId = pageState.versions[pageState.index].id;
  render();
}

export function clearPinned(): void {
  pageState.pinnedId = null;
  render();
}

export async function executeRun(): Promise<void> {
  const errorBox = getElement('error');
  errorBox.textContent = '';
  const editors = getEditors();
  let state: JsonValue;
  let questions: Questions;
  try {
    state = JSON.parse(editors.stateEditor.state.doc.toString());
  }
  catch (failure) {
    errorBox.textContent = 'state is not valid JSON: ' + (failure as Error).message;
    return;
  }
  try {
    questions = JSON.parse(editors.questionsEditor.state.doc.toString());
  }
  catch (failure) {
    errorBox.textContent = 'questions is not valid JSON: ' + (failure as Error).message;
    return;
  }
  const calls = Number(getInput('callsInput').value);
  const typedKey = readTypedKey();
  const submitButton = getButton('submitBtn');
  submitButton.disabled = true;
  submitButton.textContent = 'running…';
  try {
    const runBody: RunBody = { id: pageState.versions[pageState.index].id, state: state, questions: questions, calls: calls };
    if (typedKey !== '')
      runBody.apiKey = typedKey;
    const response = await sendJson('/run', runBody);
    const version: Version = await response.json();
    pageState.versions[version.id - 1] = version;
    pageState.index = version.id - 1;
    loadEditors();
    render();
  }
  catch (failure) {
    const failureMessage = (failure as Error).message;
    const safeMessage = typedKey === '' ? failureMessage : failureMessage.replaceAll(typedKey, '[key hidden]');
    // errorBox.textContent = 'Run failed: ' + (failure as Error).message;
    errorBox.textContent = 'Run failed: ' + safeMessage;
  }
  finally {
    // submitButton.disabled = false;
    submitButton.textContent = 'Submit (paid)';
    updateSubmitAvailability();
  }
}

export async function resetHistory(): Promise<void> {
  const errorBox = getElement('error');
  errorBox.textContent = '';
  const isConfirmed = confirm('Archive all ' + pageState.versions.length + ' versions and start over from the seed version?');
  if (!isConfirmed)
    return;
  try {
    const resetBody: ResetBody = {};
    const response = await sendJson('/reset', resetBody);
    const fresh: Version[] = await response.json();
    pageState.versions.splice(0, pageState.versions.length, ...fresh);
    pageState.index = 0;
    pageState.pinnedId = null;
    loadEditors();
    render();
  }
  catch (failure) {
    errorBox.textContent = 'Reset failed: ' + (failure as Error).message;
  }
}

export function setAllGraphsCollapsed(isCollapsed: boolean): void {
  const blocks = getElement('graphs').children;
  for (const block of blocks) {
    if (!(block instanceof HTMLElement))
      throw new Error('graph block is not an element');
    const name = block.dataset.questionName;
    if (name === undefined)
      throw new Error('graph block has no question name');
    pageState.collapsedByName[name] = isCollapsed;
  }
  render();
}

export function setAllGraphsToCollapsed(): void {
  setAllGraphsCollapsed(true);
}

export function setAllGraphsToExpanded(): void {
  setAllGraphsCollapsed(false);
}

export async function saveNote(): Promise<void> {
  const errorBox = getElement('error');
  errorBox.textContent = '';
  const version = pageState.versions[pageState.index];
  try {
    const noteBody: NoteBody = { id: version.id, note: getTextArea('noteText').value };
    const response = await sendJson('/note', noteBody);
    const saved: Version = await response.json();
    version.note = saved.note;
    render();
  }
  catch (failure) {
    errorBox.textContent = 'Note save failed: ' + (failure as Error).message;
  }
}
