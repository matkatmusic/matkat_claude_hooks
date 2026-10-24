import { test, expect } from 'bun:test'
import { clearHover, render, renderOnDocChange } from './render'

function validateModuleLoadsWithoutDom() {
  expect(typeof render).toBe('function')
  expect(typeof renderOnDocChange).toBe('function')
  expect(typeof clearHover).toBe('function')
}

test('test_render_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
