import type { HoverTracker, Summary, Version } from './types';
import { buildBarInfoRows } from './barInfo';
import { renderColumn } from './chartColumn';
import { updateShownInfo } from './chartHover';
import { createSvgNode, getElement } from './dom';
import { BOTTOM, computePlotHeight, computeSlotLeft, computeSlotWidth, computeY, LEFT, TICK_COUNT, TOP } from './geometry';
import { createBarInfoBox, createWinnerLines } from './infoDom';
import { findPinned, readPinnedData } from './pinned';
import { pageState } from './state';
import { computeSummary, listAnswers, listOptionKeys, listValues } from './values';

function renderAxis(svg: Element, plotRight: number, plotH: number): void {
  for (let tick = 0; tick <= TICK_COUNT; tick++) {
    const value = tick / TICK_COUNT;
    svg.appendChild(createSvgNode('line', { x1: LEFT, x2: plotRight, y1: computeY(value, plotH), y2: computeY(value, plotH), stroke: 'var(--grid)' }));
    svg.appendChild(createSvgNode('text', { x: LEFT - 6, y: computeY(value, plotH) + 4, 'text-anchor': 'end' }, value.toFixed(1)));
  }
}

export function renderChart(box: HTMLElement, version: Version, name: string): void {
  const question = version.questions[name];
  const answers = listAnswers(version, name);
  const keys = listOptionKeys(answers[0]);
  const stats: Record<string, Summary> = {};
  for (const key of keys)
    stats[key] = computeSummary(listValues(answers, key));
  function compareByAverage(a: string, b: string): number {
    return stats[b].average - stats[a].average;
  }
  keys.sort(compareByAverage);
  getElement('hoverLine').appendChild(createWinnerLines(question, answers));
  const isAverageShown = pageState.averageShownByName[name] === true;
  const block = box.parentElement;
  if (block === null)
    throw new Error('chart box has no parent block');
  const tracker: HoverTracker = { block: block, shownHit: null };
  const pinned = readPinnedData(findPinned(pageState.versions, pageState.pinnedId), name);
  const plotH = computePlotHeight(box.clientHeight);
  const pinnedCount = pinned === null ? 0 : pinned.answers.length;
  const slot = computeSlotWidth(Math.max(answers.length, pinnedCount), isAverageShown);
  const plotRight = LEFT + keys.length * slot;
  const svg = createSvgNode('svg', { width: plotRight + 20, height: TOP + plotH + BOTTOM, role: 'img' });
  renderAxis(svg, plotRight, plotH);
  for (let i = 0; i < keys.length; i++) {
    const slotX = computeSlotLeft(i, slot);
    const pinnedId = pageState.pinnedId;
    renderColumn({ svg, tracker, question, answers, keys, key: keys[i], pinned, pinnedId, slotX, plotH, isAverageShown });
  }
  box.replaceChildren(svg);
  const emptyRows = buildBarInfoRows({ question, answers, key: '', keys, pinnedValues: pinned === null ? null : [], callIndex: null, pinnedId: pageState.pinnedId });
  updateShownInfo(tracker, createBarInfoBox(emptyRows), null);
}
