// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test'

const environment = (globalThis as any).process.env
environment.TYPESAFE_API_KEY ??= 'test-only'

async function validatePageFillsEveryMarker() {
  const { buildPage } = await import('./playground')
  const page = await buildPage()
  expect(page.includes('__PAGE_CSS__')).toBe(false)
  expect(page.includes('__PAGE_SCRIPT__')).toBe(false)
  expect(page.includes('__DATA_JSON__')).toBe(false)
  expect(page.includes('<script type="module">')).toBe(true)
  expect(page.includes('"versions"')).toBe(true)
}

async function validatePageHoldsFlagButNeverTheKey() {
  const { buildPage } = await import('./playground')
  const page = await buildPage()
  expect(page.includes('"hasEnvKey":true')).toBe(true)
  expect(page.includes(environment.TYPESAFE_API_KEY)).toBe(false)
}

test('test_page_has_no_markers_left_and_holds_the_script_and_data', validatePageFillsEveryMarker)
test('test_page_holds_the_key_flag_but_never_the_key', validatePageHoldsFlagButNeverTheKey)
