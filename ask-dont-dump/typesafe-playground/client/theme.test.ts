import { test, expect } from 'bun:test'
import { computeOtherTheme, readThemeName } from './theme'

function validateReadThemeName() {
  expect(readThemeName('dark', false)).toBe('dark')
  expect(readThemeName('light', true)).toBe('light')
  expect(readThemeName(null, true)).toBe('dark')
  expect(readThemeName(null, false)).toBe('light')
}

function validateComputeOtherTheme() {
  expect(computeOtherTheme('dark')).toBe('light')
  expect(computeOtherTheme('light')).toBe('dark')
  expect(computeOtherTheme(undefined)).toBe('dark')
}

test('test_read_theme_name_prefers_saved_theme', validateReadThemeName)
test('test_other_theme_flips_dark_and_light', validateComputeOtherTheme)
