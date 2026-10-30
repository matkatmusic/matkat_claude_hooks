import { test, expect } from 'claude-code/testing';
import { parseYesPhrase } from './nudgeFile';

test('test_yes_with_colon_and_quotes_gives_the_bare_sentence', () => {
  expect(parseYesPhrase('Yes: "There is a crash."', 'Oops. There is a crash. Fix it.')).toBe('There is a crash.');
});

test('test_yes_with_comma_and_curly_quotes_gives_the_bare_sentence', () => {
  expect(parseYesPhrase('yes, “There is a crash.”', 'There is a crash.')).toBe('There is a crash.');
});

test('test_yes_with_a_sentence_not_in_the_answer_gives_an_empty_phrase', () => {
  expect(parseYesPhrase('yes: "There is a crash."', 'Nothing is wrong.')).toBe('');
});

test('test_yes_with_no_sentence_gives_an_empty_phrase', () => {
  expect(parseYesPhrase('yes', 'There is a crash.')).toBe('');
});

test('test_no_gives_an_empty_phrase', () => {
  expect(parseYesPhrase('no', 'There is a crash.')).toBe('');
});
