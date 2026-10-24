import type { Question } from '@typesafe-ai/sdk';
import type { Answer, InfoPart, InfoRow } from './types';
import { formatValueText } from './values';
import { formatWinnerLine, listWinnerGroups } from './winners';

export function addPart(parent: HTMLElement, text: string, className: string): void {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
}

export function addParts(parent: HTMLElement, parts: InfoPart[]): void {
  for (const part of parts)
    addPart(parent, part[0], part[1]);
}

export function addInfoRow(box: HTMLElement, row: InfoRow): void {
  addPart(box, row.label, 'info-label');
  const valueCell = document.createElement('span');
  valueCell.className = 'info-cell';
  addParts(valueCell, row.parts);
  box.appendChild(valueCell);
}

export function createBarInfoBox(rows: InfoRow[]): HTMLDivElement {
  const box = document.createElement('div');
  box.className = 'bar-info';
  for (const row of rows)
    addInfoRow(box, row);
  return box;
}

export function createWinnerLines(question: Question, answers: Answer[]): HTMLDivElement {
  const lines = document.createElement('div');
  const instructionLine = document.createElement('div');
  instructionLine.className = 'info-label';
  instructionLine.textContent = formatValueText(question.instructions);
  lines.appendChild(instructionLine);
  for (const group of listWinnerGroups(answers)) {
    const winnerLine = document.createElement('div');
    winnerLine.className = 'info-value';
    winnerLine.style.paddingLeft = '2em';
    winnerLine.textContent = formatWinnerLine(question, group);
    lines.appendChild(winnerLine);
  }
  return lines;
}
