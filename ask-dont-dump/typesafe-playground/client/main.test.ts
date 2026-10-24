import { test, expect } from 'bun:test'

async function validateMainBundlesForTheBrowser() {
  const result = await Bun.build({
    entrypoints: [`${import.meta.dir}/main.ts`],
    target: 'browser',
    format: 'esm',
    external: ['codemirror', '@codemirror/*', '@lezer/*'],
  })
  expect(result.success).toBe(true)
  const script = await result.outputs[0].text()
  expect(script.includes("from 'codemirror'") || script.includes('from "codemirror"')).toBe(true)
}

test('test_main_bundles_for_the_browser_with_codemirror_left_external', validateMainBundlesForTheBrowser)
