import type { ColumnContext } from './types';
import { buildBarInfoRows } from './barInfo';
import { attachHover } from './chartHover';
import { renderOption } from './chartOption';
import { createSvgNode } from './dom';
import { computeBarOffset, computeHitBar } from './geometry';
import { createBarInfoBox } from './infoDom';
import { listValues } from './values';

export function renderColumn(context: ColumnContext): void {
  const { svg, tracker, question, answers, keys, key, pinned, pinnedId, slotX, plotH, isAverageShown } = context;
  let pinnedValues: number[] | null = null;
  if (pinned !== null) {
    const isPinnedKey = pinned.keys.indexOf(key) >= 0;
    if (isPinnedKey) {
      pinnedValues = listValues(pinned.answers, key);
      renderOption(svg, pinnedValues, slotX, true, plotH, isAverageShown);
    }
  }
  const optionValues = listValues(answers, key);
  renderOption(svg, optionValues, slotX, false, plotH, isAverageShown);
  const offset = computeBarOffset(isAverageShown);
  for (let callIndex = isAverageShown ? -1 : 0; callIndex < optionValues.length; callIndex++) {
    const bar = computeHitBar(slotX, offset, callIndex, optionValues, plotH);
    const hit = createSvgNode('rect', { x: bar.x, y: bar.y, width: bar.width, height: bar.height, fill: 'transparent', 'stroke-width': 1 });
    const rows = buildBarInfoRows({ question, answers, key, keys, pinnedValues, callIndex, pinnedId });
    attachHover(tracker, svg, hit, createBarInfoBox(rows), optionValues, slotX, plotH, isAverageShown);
    svg.appendChild(hit);
  }
}
