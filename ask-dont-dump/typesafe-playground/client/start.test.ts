import { test, expect } from 'bun:test'
import { initPage, moveOnArrowKey, parsePageData } from './start'

function validateParsePageData() {
  const data = parsePageData('{"versions":[{"id":1,"time":"now","state":null,"questions":{},"calls":0,"outputs":[]}]}')
  expect(data.versions.length).toBe(1)
  expect(data.versions[0].id).toBe(1)
}

function validateModuleLoadsWithoutDom() {
  expect(typeof initPage).toBe('function')
  expect(typeof moveOnArrowKey).toBe('function')
}

test('test_parse_page_data_reads_the_versions', validateParsePageData)
test('test_start_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
