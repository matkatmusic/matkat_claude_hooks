import { test, expect } from 'bun:test'
import { createAverageToggle, createCollapseButton, createGraphBlock, formatGraphTitle } from './graphBlock'

function validateGraphTitleHoldsNumberNameAndInstructions() {
  const title = formatGraphTitle(2, 'needsTask', { type: 'noul', instructions: 'Is it?' })
  expect(title.includes('Q2')).toBe(true)
  expect(title.includes('needsTask')).toBe(true)
  expect(title.includes('Is it?')).toBe(true)
}

function validateModuleLoadsWithoutDom() {
  expect(typeof createAverageToggle).toBe('function')
  expect(typeof createGraphBlock).toBe('function')
  expect(typeof createCollapseButton).toBe('function')
}

test('test_graph_title_holds_number_name_and_instructions', validateGraphTitleHoldsNumberNameAndInstructions)
test('test_graph_block_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
