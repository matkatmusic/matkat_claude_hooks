// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test'
import { isRequestAllowed, listAllowedHosts } from './playgroundGuard'

const HOSTNAME = '127.0.0.1'
const PORT = 4318

function makeRequest(method: string, headers: Record<string, string>) {
  return new Request('http://127.0.0.1:4318/run', { method, headers })
}

function validateAllowedHostsUseHostnameAndLocalhost() {
  expect(listAllowedHosts(HOSTNAME, PORT)).toEqual(['127.0.0.1:4318', 'localhost:4318'])
}

function validateGetWithAllowedHostPasses() {
  expect(isRequestAllowed(makeRequest('GET', { host: '127.0.0.1:4318' }), HOSTNAME, PORT)).toBe(true)
  expect(isRequestAllowed(makeRequest('GET', { host: 'localhost:4318' }), HOSTNAME, PORT)).toBe(true)
}

function validatePostWithAllowedHostOriginAndJsonPasses() {
  const headers = { host: 'localhost:4318', origin: 'http://localhost:4318', 'content-type': 'application/json' }
  expect(isRequestAllowed(makeRequest('POST', headers), HOSTNAME, PORT)).toBe(true)
  const charsetHeaders = { host: '127.0.0.1:4318', origin: 'http://127.0.0.1:4318', 'content-type': 'application/json; charset=utf-8' }
  expect(isRequestAllowed(makeRequest('POST', charsetHeaders), HOSTNAME, PORT)).toBe(true)
}

function validateWrongHostFails() {
  expect(isRequestAllowed(makeRequest('GET', { host: 'evil.example:4318' }), HOSTNAME, PORT)).toBe(false)
  expect(isRequestAllowed(makeRequest('GET', { host: '127.0.0.1:9999' }), HOSTNAME, PORT)).toBe(false)
}

function validateForeignOriginFails() {
  const headers = { host: '127.0.0.1:4318', origin: 'https://evil.example', 'content-type': 'application/json' }
  expect(isRequestAllowed(makeRequest('POST', headers), HOSTNAME, PORT)).toBe(false)
}

function validateMissingOriginOnPostFails() {
  const headers = { host: '127.0.0.1:4318', 'content-type': 'application/json' }
  expect(isRequestAllowed(makeRequest('POST', headers), HOSTNAME, PORT)).toBe(false)
}

function validateTextPlainContentTypeFails() {
  const headers = { host: '127.0.0.1:4318', origin: 'http://127.0.0.1:4318', 'content-type': 'text/plain' }
  expect(isRequestAllowed(makeRequest('POST', headers), HOSTNAME, PORT)).toBe(false)
}

test('test_allowed_hosts_use_hostname_and_localhost', validateAllowedHostsUseHostnameAndLocalhost)
test('test_get_with_allowed_host_passes', validateGetWithAllowedHostPasses)
test('test_post_with_allowed_host_origin_and_json_passes', validatePostWithAllowedHostOriginAndJsonPasses)
test('test_wrong_host_fails', validateWrongHostFails)
test('test_foreign_origin_fails', validateForeignOriginFails)
test('test_missing_origin_on_post_fails', validateMissingOriginOnPostFails)
test('test_text_plain_content_type_fails', validateTextPlainContentTypeFails)
