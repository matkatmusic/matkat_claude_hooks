import { test, expect } from 'claude-code/testing';
import {
  DISPATCH_ALL_OFF,
  NO_PROCESS_FOUND,
  TEMPLATE_TEXT,
  createRecordedCalls,
  getAssistantMessage,
  getUserMessage,
  setFsStubs,
  setSessionStubs,
} from './idleStateTestHelpers';

function createHandlerCollector() {
  const handlers: Record<string, (_$: any, e: any) => any> = {};
  function appendHandler(name: string, handler: (_$: any, e: any) => any) {
    handlers[name] = handler;
  }
  return { handlers, appendHandler };
}

function getEmptyMessages() {
  return { value: [] };
}

function assertMessageBuildersSetRole() {
  expect(getAssistantMessage('hi')).toEqual({ role: 'assistant', text: 'hi', toolUses: [] });
  expect(getUserMessage('yo')).toEqual({ role: 'user', text: 'yo', toolUses: [] });
}

function assertCreateRecordedCallsReturnsFreshArrays() {
  const first = createRecordedCalls();
  const second = createRecordedCalls();
  first.commands.push('exit');
  expect(second.commands).toEqual([]);
  expect(first.written).toEqual([]);
  expect(first.submitted).toEqual([]);
}

function assertSetFsStubsReadsDispatchFileOrTemplate() {
  const { handlers, appendHandler } = createHandlerCollector();
  setFsStubs(appendHandler, DISPATCH_ALL_OFF);
  expect(handlers['fs.exists']?.(undefined, {})).toEqual({ value: false });
  expect(handlers['fs.read']?.(undefined, { path: '/p/dispatch.json' })).toEqual({ value: DISPATCH_ALL_OFF });
  expect(handlers['fs.read']?.(undefined, { path: '/p/template.json' })).toEqual({ value: TEMPLATE_TEXT });
}

function assertSetSessionStubsRecordsWritesAndCommands() {
  const { handlers, appendHandler } = createHandlerCollector();
  const recorded = createRecordedCalls();
  setSessionStubs(appendHandler, recorded, getEmptyMessages);
  handlers['fs.write']?.(undefined, { path: '/a', text: 'b' });
  handlers['command.run']?.(undefined, { command: 'exit' });
  handlers['prompt.submit']?.(undefined, { text: 'hello' });
  expect(recorded.written).toEqual([{ path: '/a', text: 'b' }]);
  expect(recorded.commands).toEqual(['exit']);
  expect(recorded.submitted).toEqual(['hello']);
  expect(handlers['process.run']?.(undefined, {})).toEqual({ value: NO_PROCESS_FOUND });
  expect(handlers['session.root']?.(undefined, {})).toEqual({ value: '/work/my-project' });
}

test('message builders set the role and keep the text', assertMessageBuildersSetRole);
test('createRecordedCalls returns a fresh set of arrays each time', assertCreateRecordedCallsReturnsFreshArrays);
test('setFsStubs reads the dispatch file or the template', assertSetFsStubsReadsDispatchFileOrTemplate);
test('setSessionStubs records writes, commands and submitted prompts', assertSetSessionStubsRecordsWritesAndCommands);
