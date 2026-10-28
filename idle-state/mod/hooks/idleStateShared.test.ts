import { test, expect } from 'claude-code/testing';
import { clearState, encodeRegexCharacters, formatTwoDigits, idleState } from './idleStateShared';

function assertFormatTwoDigitsPadsSingleDigits() {
  expect(formatTwoDigits(5)).toBe('05');
  expect(formatTwoDigits(0)).toBe('00');
  expect(formatTwoDigits(12)).toBe('12');
}

function assertEncodeRegexCharactersEscapesSpecials() {
  expect(encodeRegexCharacters('node server.js --port=(80)')).toBe('node server\\.js --port=\\(80\\)');
  expect(encodeRegexCharacters('a|b*c+d?e[f]{g}^$')).toBe('a\\|b\\*c\\+d\\?e\\[f\\]\\{g\\}\\^\\$');
}

function assertEncodeRegexCharactersKeepsPlainText() {
  expect(encodeRegexCharacters('bun run server')).toBe('bun run server');
  expect(encodeRegexCharacters('')).toBe('');
}

function assertClearStateResetsStateAndCallsNext() {
  idleState.stateFilePath = '/work/state.json';
  idleState.isWritingState = true;
  const seenEvents: string[] = [];
  function appendSeenEvent(e: string) {
    seenEvents.push(e);
    return 'next result';
  }
  const result = clearState(undefined, 'the event', appendSeenEvent);
  expect(result).toBe('next result');
  expect(seenEvents).toEqual(['the event']);
  expect(idleState.stateFilePath).toBeUndefined();
  expect(idleState.isWritingState).toBe(false);
}

test('formatTwoDigits pads single digits with a zero', assertFormatTwoDigitsPadsSingleDigits);
test('encodeRegexCharacters escapes each regex special character', assertEncodeRegexCharactersEscapesSpecials);
test('encodeRegexCharacters keeps text with no special characters', assertEncodeRegexCharactersKeepsPlainText);
test('clearState clears the state and passes the event to next', assertClearStateResetsStateAndCallsNext);
