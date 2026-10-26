import type { ViewUpdate } from '@codemirror/view';
import { renderChart } from './chart';
import { getElement } from './dom';
import { createGraphBlock } from './graphBlock';
import { addPart, addParts, createWinnerLines } from './infoDom';
import { applyNoteBox } from './noteBox';
import { getEditors, pageState } from './state';
import { listAnswers } from './values';
import {
  computeInputTokens, createEditedVersion, isTextEdited, listCostLineParts, listPinLineParts, listVersionLineParts,
} from './versionView';

export function clearHover(): void {
  getElement('hoverLine').textContent = pageState.restingText;
}

export function renderOnDocChange(update: ViewUpdate): void {
  if (update.docChanged)
    render();
}

export function render(): void {
  const { versions, index } = pageState;
  const editors = getEditors();
  const stateText = editors.stateEditor.state.doc.toString();
  const questionsText = editors.questionsEditor.state.doc.toString();
  const shownVersion = versions[index];
  const isEdited = isTextEdited(stateText, questionsText, shownVersion);
  const version = isEdited ? createEditedVersion(shownVersion, versions.length) : shownVersion;
  const shownNumber = isEdited ? versions.length + 1 : index + 1;
  const versionCount = isEdited ? versions.length + 1 : versions.length;
  if (isEdited !== pageState.wasEdited) {
    pageState.wasEdited = isEdited;
    applyNoteBox(version.outputs.length > 0, version.note);
  }
  const versionMeta = getElement('versionMeta');
  versionMeta.replaceChildren();
  addParts(versionMeta, listVersionLineParts(shownNumber, versionCount, version.time, version.calls));
  const pinInfo = getElement('pinInfo');
  pinInfo.replaceChildren();
  addParts(pinInfo, listPinLineParts(pageState.pinnedId));
  const costLine = getElement('costLine');
  costLine.replaceChildren();
  addParts(costLine, listCostLineParts(computeInputTokens(version.outputs)));
  const names = Object.keys(version.questions);
  const graphs = getElement('graphs');
  graphs.replaceChildren();
  const boxes: HTMLDivElement[] = [];
  for (let i = 0; i < names.length; i++) {
    const graphBlock = createGraphBlock(i + 1, names[i], version.questions[names[i]], render);
    graphs.appendChild(graphBlock.block);
    boxes.push(graphBlock.box);
  }
  const hoverLine = getElement('hoverLine');
  hoverLine.replaceChildren();
  const winnersTitle = document.createElement('div');
  winnersTitle.textContent = 'Winners:';
  winnersTitle.className = 'other-label';
  hoverLine.appendChild(winnersTitle);
  for (let i = 0; i < names.length; i++) {
    const hasOutputs = version.outputs.length > 0 && version.outputs[0].answers[names[i]] !== undefined;
    if (!hasOutputs) {
      boxes[i].style.display = 'flex';
      boxes[i].style.alignItems = 'center';
      boxes[i].style.justifyContent = 'center';
      addPart(boxes[i], 'Submit a run to generate a graph', 'other-label');
      continue;
    }
    const isCollapsed = pageState.collapsedByName[names[i]] === true;
    if (isCollapsed) {
      hoverLine.appendChild(createWinnerLines(version.questions[names[i]], listAnswers(version, names[i])));
      continue;
    }
    renderChart(boxes[i], version, names[i]);
  }
}
