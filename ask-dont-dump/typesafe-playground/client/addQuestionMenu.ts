import type { QuestionType } from './questionSnippets';

export type PickHandler = (type: QuestionType) => void;

interface MenuItem {
  type: QuestionType;
  title: string;
  description: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { type: 'noul', title: 'Noul', description: 'Evaluate how true something is' },
  { type: 'score', title: 'Score', description: 'Set up and grade with a rubric' },
  { type: 'choice', title: 'Choice', description: 'Ask a multiple choice question' },
];

function createTextSpan(className: string, text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function createItemButton(item: MenuItem, onPick: PickHandler): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'add-question-item';
  button.append(createTextSpan('add-question-item-title', item.title));
  button.append(createTextSpan('add-question-item-desc', item.description));
  function selectItem(): void {
    onPick(item.type);
  }
  button.addEventListener('click', selectItem);
  return button;
}

export function createMenuElement(onPick: PickHandler): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'add-question-menu';
  menu.append(createTextSpan('add-question-menu-header', 'ADD QUESTION'));
  for (let i = 0; i < MENU_ITEMS.length; i++)
    menu.append(createItemButton(MENU_ITEMS[i], onPick));
  return menu;
}

export function setMenuPosition(menu: HTMLElement, button: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  const menuHeight = menu.offsetHeight;
  const roomBelow = window.innerHeight - rect.bottom;
  const fitsBelow = roomBelow >= menuHeight + 4;
  menu.style.left = rect.left + 'px';
  if (fitsBelow)
    menu.style.top = rect.bottom + 4 + 'px';
  else
    menu.style.top = Math.max(0, rect.top - menuHeight - 4) + 'px';
}

export function createAddQuestionElement(onPick: PickHandler): HTMLElement {
  const root = document.createElement('div');
  root.className = 'add-question';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'add-question-btn';
  button.textContent = 'Add Question ⌄';
  function closeMenu(): void {
    menu.remove();
    document.removeEventListener('mousedown', closeOnOutsideClick);
    document.removeEventListener('keydown', closeOnEscape);
  }
  function closeOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node))
      throw new Error('mousedown target is not a node');
    const isInsideMenu = menu.contains(target);
    const isInsideRoot = root.contains(target);
    const isInside = isInsideMenu || isInsideRoot;
    if (isInside)
      return;
    closeMenu();
  }
  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape')
      closeMenu();
  }
  function openMenu(): void {
    if (menu.isConnected)
      return;
    document.body.append(menu);
    setMenuPosition(menu, button);
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
  }
  function selectAndClose(type: QuestionType): void {
    closeMenu();
    onPick(type);
  }
  const menu = createMenuElement(selectAndClose);
  button.addEventListener('click', openMenu);
  root.append(button);
  return root;
}
