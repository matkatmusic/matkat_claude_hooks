import type { SvgAttributes } from './types';

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null)
    throw new Error(`element ${id} is missing`);
  return element;
}

export function getTextArea(id: string): HTMLTextAreaElement {
  const element = getElement(id);
  if (!(element instanceof HTMLTextAreaElement))
    throw new Error(`element ${id} is not a textarea`);
  return element;
}

export function getInput(id: string): HTMLInputElement {
  const element = getElement(id);
  if (!(element instanceof HTMLInputElement))
    throw new Error(`element ${id} is not an input`);
  return element;
}

export function getButton(id: string): HTMLButtonElement {
  const element = getElement(id);
  if (!(element instanceof HTMLButtonElement))
    throw new Error(`element ${id} is not a button`);
  return element;
}

export function createSvgNode(name: string, attrs: SvgAttributes, text?: string): SVGElement {
  const node = document.createElementNS(SVG_NAMESPACE, name);
  for (const key in attrs)
    node.setAttribute(key, String(attrs[key]));
  if (text !== undefined)
    node.textContent = text;
  return node;
}
