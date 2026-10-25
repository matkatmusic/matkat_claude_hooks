import type { LoadBody, NewBody, ResetRunsBody, SaveBody, Version } from './types';
import { sendJson } from './actions';
import { getElement, getInput } from './dom';
import { loadEditors } from './editors';
import { render } from './render';
import { pageState } from './state';

export async function createNewHistory(): Promise<void> {
  const errorBox = getElement('error');
  errorBox.textContent = '';
  try {
    const newBody: NewBody = {};
    const response = await sendJson('/new', newBody);
    const fresh: Version[] = await response.json();
    pageState.versions.splice(0, pageState.versions.length, ...fresh);
    pageState.index = 0;
    pageState.pinnedId = null;
    loadEditors();
    render();
  }
  catch (failure) {
    errorBox.textContent = 'New failed: ' + (failure as Error).message;
  }
}

export async function saveVersions(): Promise<void> {
  const errorBox = getElement('error');
  errorBox.textContent = '';
  try {
    const saveBody: SaveBody = {};
    const response = await sendJson('/save', saveBody);
    const saved: { path: string } = await response.json();
    alert('Saved: ' + saved.path);
  }
  catch (failure) {
    errorBox.textContent = 'Save failed: ' + (failure as Error).message;
  }
}

export function openLoadPicker(): void {
  getInput('loadInput').click();
}

export async function loadVersions(): Promise<void> {
  const errorBox = getElement('error');
  errorBox.textContent = '';
  const loadInput = getInput('loadInput');
  const files = loadInput.files;
  const isFilesMissing = files === null;
  const isFilesEmpty = files !== null && files.length === 0;
  const isNothingPicked = isFilesMissing || isFilesEmpty;
  if (isNothingPicked)
    return;
  try {
    const versions: Version[] = JSON.parse(await files[0].text());
    const loadBody: LoadBody = { versions: versions };
    const response = await sendJson('/load', loadBody);
    const loaded: Version[] = await response.json();
    pageState.versions.splice(0, pageState.versions.length, ...loaded);
    pageState.index = pageState.versions.length - 1;
    pageState.pinnedId = null;
    loadEditors();
    render();
  }
  catch (failure) {
    errorBox.textContent = 'Load failed: ' + (failure as Error).message;
  }
  finally {
    loadInput.value = '';
  }
}

export async function resetVersionRuns(): Promise<void> {
  const errorBox = getElement('error');
  errorBox.textContent = '';
  const shownVersion = pageState.versions[pageState.index];
  const isConfirmed = confirm('Erase all runs and the note of version ' + shownVersion.id + '?');
  if (!isConfirmed)
    return;
  try {
    const resetRunsBody: ResetRunsBody = { id: shownVersion.id };
    const response = await sendJson('/reset-runs', resetRunsBody);
    const cleared: Version = await response.json();
    pageState.versions[pageState.index] = cleared;
    if (pageState.pinnedId === cleared.id)
      pageState.pinnedId = null;
    loadEditors();
    render();
  }
  catch (failure) {
    errorBox.textContent = 'Reset runs failed: ' + (failure as Error).message;
  }
}
