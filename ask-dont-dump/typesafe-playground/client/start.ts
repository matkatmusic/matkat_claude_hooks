import type { PageData } from './types';
import {
  clearPinned, executeRun, moveBy, moveToNext, moveToPrevious, resetHistory, saveNote, setPinnedToShown,
} from './actions';
import { getElement } from './dom';
import { createEditors, loadEditors } from './editors';
import { render, renderOnDocChange } from './render';
import { pageState } from './state';
import { readThemeName, setTheme, toggleTheme } from './theme';
import { loadVersions, openLoadPicker, resetVersionRuns, saveVersions, createNewHistory } from './versionActions';

export function parsePageData(text: string): PageData {
  const data: PageData = JSON.parse(text);
  return data;
}

export function moveOnArrowKey(event: KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof Element))
    throw new Error('keydown target is not an element');
  const isFormField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
  if (isFormField)
    return;
  const editorAncestor = target.closest('.cm-editor');
  if (editorAncestor !== null)
    return;
  if (event.key === 'ArrowLeft')
    moveBy(-1);
  if (event.key === 'ArrowRight')
    moveBy(1);
}

export function initPage(): void {
  const dataText = getElement('data').textContent;
  if (dataText === null)
    throw new Error('data element has no text');
  const data = parsePageData(dataText);
  pageState.versions = data.versions;
  pageState.index = data.versions.length - 1;
  pageState.editors = createEditors(renderOnDocChange);
  getElement('noteText').addEventListener('change', saveNote);
  getElement('resetBtn').addEventListener('click', resetHistory);
  getElement('newBtn').addEventListener('click', createNewHistory);
  getElement('saveBtn').addEventListener('click', saveVersions);
  getElement('loadBtn').addEventListener('click', openLoadPicker);
  getElement('loadInput').addEventListener('change', loadVersions);
  getElement('resetRunsBtn').addEventListener('click', resetVersionRuns);
  getElement('submitBtn').addEventListener('click', executeRun);
  getElement('prev').addEventListener('click', moveToPrevious);
  getElement('next').addEventListener('click', moveToNext);
  getElement('pinBtn').addEventListener('click', setPinnedToShown);
  getElement('unpinBtn').addEventListener('click', clearPinned);
  getElement('themeBtn').addEventListener('click', toggleTheme);
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(readThemeName(localStorage.getItem('theme'), prefersDark));
  document.addEventListener('keydown', moveOnArrowKey);
  window.addEventListener('resize', render);
  loadEditors();
  render();
}
