import type { BarGeometry, LabelPoint } from './types';
import { createSvgNode } from './dom';
import {
  computeAverageBar, computeAverageLabelPoint, computeBarOffset, computeCallBar, computeCallLabelPoint, computeRangeLine, PINNED_PAD,
} from './geometry';
import { computeSummary } from './values';

const LABEL_STYLE = 'font-size: 9px; fill: var(--text)';

function createBarRect(bar: BarGeometry, fill: string, opacity: number): SVGElement {
  return createSvgNode('rect', { x: bar.x, y: bar.y, width: bar.width, height: bar.height, fill: fill, opacity: opacity });
}

function createRotatedLabel(point: LabelPoint, text: string): SVGElement {
  const transform = 'rotate(-90 ' + point.x + ' ' + point.y + ')';
  return createSvgNode('text', { x: point.x, y: point.y, transform: transform, style: LABEL_STYLE }, text);
}

export function renderOption(svg: Element, values: number[], slotX: number, isPinned: boolean, plotH: number, isAverageShown: boolean): void {
  const stat = computeSummary(values);
  const fill = isPinned ? 'var(--text-muted)' : 'var(--score)';
  const opacity = isPinned ? 0.35 : 1;
  const pad = isPinned ? PINNED_PAD : 0;
  const offset = computeBarOffset(isAverageShown);
  if (isAverageShown) {
    const averageBar = computeAverageBar(slotX, stat.average, plotH, pad);
    svg.appendChild(createBarRect(averageBar, isPinned ? fill : 'var(--confidence)', opacity));
    const rangeLine = computeRangeLine(slotX, stat, plotH);
    svg.appendChild(createSvgNode('line', { x1: rangeLine.x, x2: rangeLine.x, y1: rangeLine.y1, y2: rangeLine.y2, stroke: 'var(--text)', 'stroke-width': 1.5, opacity: opacity }));
  }
  for (let k = 0; k < values.length; k++) {
    const callBar = computeCallBar(slotX, offset, k, values[k], plotH, pad);
    svg.appendChild(createBarRect(callBar, fill, opacity));
  }
}

export function renderValueLabels(svg: Element, values: number[], slotX: number, plotH: number, isAverageShown: boolean): void {
  const group = createSvgNode('g', { class: 'value-labels', 'pointer-events': 'none' });
  const offset = computeBarOffset(isAverageShown);
  if (isAverageShown) {
    const stat = computeSummary(values);
    const averagePoint = computeAverageLabelPoint(slotX, stat.average, plotH);
    group.appendChild(createRotatedLabel(averagePoint, stat.average.toFixed(3)));
  }
  for (let k = 0; k < values.length; k++) {
    const callPoint = computeCallLabelPoint(slotX, offset, k, values[k], plotH);
    group.appendChild(createRotatedLabel(callPoint, values[k].toFixed(3)));
  }
  svg.appendChild(group);
}
