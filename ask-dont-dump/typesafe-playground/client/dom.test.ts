import { test, expect } from 'bun:test'
import { createSvgNode, getButton, getElement, getInput, getTextArea, SVG_NAMESPACE } from './dom'

function validateModuleLoadsWithoutDom() {
  expect(SVG_NAMESPACE).toBe('http://www.w3.org/2000/svg')
  expect(typeof createSvgNode).toBe('function')
  expect(typeof getElement).toBe('function')
  expect(typeof getTextArea).toBe('function')
  expect(typeof getInput).toBe('function')
  expect(typeof getButton).toBe('function')
}

test('test_dom_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
