import { test, expect } from 'bun:test'
import { createAddQuestionElement, createMenuElement, MENU_ITEMS, setMenuPosition } from './addQuestionMenu'

function validateMenuItemsHaveTitleAndDescription() {
  expect(MENU_ITEMS.length).toBe(3)
  expect(MENU_ITEMS[0]).toEqual({ type: 'noul', title: 'Noul', description: 'Evaluate how true something is' })
  expect(MENU_ITEMS[1]).toEqual({ type: 'score', title: 'Score', description: 'Set up and grade with a rubric' })
  expect(MENU_ITEMS[2]).toEqual({ type: 'choice', title: 'Choice', description: 'Ask a multiple choice question' })
}

function validateModuleLoadsWithoutDom() {
  expect(typeof createAddQuestionElement).toBe('function')
  expect(typeof createMenuElement).toBe('function')
  expect(typeof setMenuPosition).toBe('function')
}

test('test_menu_items_have_title_and_description', validateMenuItemsHaveTitleAndDescription)
test('test_menu_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
