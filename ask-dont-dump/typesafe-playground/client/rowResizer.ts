import type { RenderCallback } from './types';

export type ResizerDirection = 'rows' | 'columns';

export const MIN_ROW_HEIGHT = 80;
export const MIN_COLUMN_WIDTH = 240;

export function computeMinimumSize(direction: ResizerDirection): number {
  return direction === 'columns' ? MIN_COLUMN_WIDTH : MIN_ROW_HEIGHT;
}

export function computeDraggedSize(startSize: number, pointerDelta: number, containerSize: number, handleSize: number, minimumSize: number): number {
  const largestSize = Math.max(containerSize - handleSize - minimumSize, minimumSize);
  const draggedSize = startSize + pointerDelta;
  if (draggedSize > largestSize)
    return largestSize;
  if (draggedSize < minimumSize)
    return minimumSize;
  return draggedSize;
}

export function attachResizer(handle: HTMLElement, firstBox: HTMLElement, container: HTMLElement, direction: ResizerDirection, onDragEnd?: RenderCallback): void {
  const isColumns = direction === 'columns';
  const minimumSize = computeMinimumSize(direction);
  let isDragging = false;
  let startPointer = 0;
  let startSize = 0;
  function readPointer(event: PointerEvent): number {
    return isColumns ? event.clientX : event.clientY;
  }
  function readSize(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    return isColumns ? rect.width : rect.height;
  }
  function initDrag(event: PointerEvent): void {
    handle.setPointerCapture(event.pointerId);
    isDragging = true;
    startPointer = readPointer(event);
    startSize = readSize(firstBox);
  }
  function moveDrag(event: PointerEvent): void {
    if (!isDragging)
      return;
    const size = computeDraggedSize(startSize, readPointer(event) - startPointer, readSize(container), readSize(handle), minimumSize);
    if (isColumns)
      firstBox.style.width = size + 'px';
    else
      firstBox.style.height = size + 'px';
  }
  function closeDrag(event: PointerEvent): void {
    isDragging = false;
    handle.releasePointerCapture(event.pointerId);
    if (onDragEnd !== undefined)
      onDragEnd();
  }
  handle.addEventListener('pointerdown', initDrag);
  handle.addEventListener('pointermove', moveDrag);
  handle.addEventListener('pointerup', closeDrag);
}
