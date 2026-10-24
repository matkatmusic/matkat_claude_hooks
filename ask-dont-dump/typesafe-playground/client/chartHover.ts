import type { HoverTracker } from './types';
import { renderValueLabels } from './chartOption';

export const HIT_STROKE_COLOR = 'hotpink';

export function updateShownInfo(tracker: HoverTracker, info: HTMLElement, hit: Element | null): void {
  const shown = tracker.block.querySelector('.bar-info');
  if (shown !== null)
    shown.remove();
  tracker.block.appendChild(info);
  if (tracker.shownHit !== null)
    tracker.shownHit.removeAttribute('stroke');
  tracker.shownHit = hit;
  if (hit !== null)
    hit.setAttribute('stroke', HIT_STROKE_COLOR);
}

export function removeValueLabels(svg: Element): void {
  const group = svg.querySelector('.value-labels');
  if (group !== null)
    group.remove();
}

export function attachHover(tracker: HoverTracker, svg: Element, hit: Element, info: HTMLElement, optionValues: number[], slotX: number, plotH: number, isAverageShown: boolean): void {
  function updateOnEnter(): void {
    updateShownInfo(tracker, info, hit);
    renderValueLabels(svg, optionValues, slotX, plotH, isAverageShown);
  }
  function removeOnLeave(): void {
    removeValueLabels(svg);
  }
  hit.addEventListener('mouseenter', updateOnEnter);
  hit.addEventListener('mouseleave', removeOnLeave);
}
