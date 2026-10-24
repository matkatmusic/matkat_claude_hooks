import type { Question } from '@typesafe-ai/sdk';
import type { GraphBlock, RenderCallback } from './types';
import { pageState } from './state';
import { formatValueText } from './values';

export function formatGraphTitle(questionNumber: number, name: string, question: Question): string {
  return 'Q' + questionNumber + ' ' + name + ' · ' + formatValueText(question.instructions);
}

export function createAverageToggle(name: string, onChange: RenderCallback): HTMLLabelElement {
  const toggle = document.createElement('label');
  toggle.className = 'avg-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = pageState.averageShownByName[name] === true;
  function updateAverageShown(): void {
    pageState.averageShownByName[name] = checkbox.checked;
    onChange();
  }
  checkbox.addEventListener('change', updateAverageShown);
  toggle.appendChild(checkbox);
  const showWord = document.createElement('span');
  showWord.className = 'other-label';
  showWord.textContent = ' Show ';
  toggle.appendChild(showWord);
  const averageWord = document.createElement('span');
  averageWord.style.color = 'var(--confidence)';
  averageWord.textContent = 'average';
  toggle.appendChild(averageWord);
  return toggle;
}

export function createGraphBlock(questionNumber: number, name: string, question: Question, onChange: RenderCallback): GraphBlock {
  const titleText = formatGraphTitle(questionNumber, name, question);
  const block = document.createElement('div');
  block.className = 'graph-block';
  const title = document.createElement('div');
  title.className = 'graph-title';
  title.textContent = titleText;
  title.title = titleText;
  const box = document.createElement('div');
  box.className = 'chart-box';
  block.appendChild(title);
  block.appendChild(createAverageToggle(name, onChange));
  block.appendChild(box);
  return { block: block, box: box };
}
