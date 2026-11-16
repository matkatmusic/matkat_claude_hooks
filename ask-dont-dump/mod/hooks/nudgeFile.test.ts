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

const DECISIONS_REPLY = 'I moved the helper into its own file and the test passes.\n\n**Decisions for you:**\n1. Keep the old file or remove it.\n2. Run the full suite now or later.';

test('test_yes_with_a_period_then_a_quote_and_notes_gives_the_quoted_sentence', () => {
  // Haiku writes "Yes." then a quote, then notes after the quote.
  const haikuText = 'Yes. "Keep the old file or remove it." asks the user to choose between two options.';
  // The result is only the quoted sentence.
  expect(parseYesPhrase(haikuText, DECISIONS_REPLY)).toBe('Keep the old file or remove it.');
});

test('test_yes_then_a_multi_line_quote_and_a_note_gives_the_quoted_text', () => {
  // Haiku quotes several lines, then adds a note after the closing quote.
  const haikuText = 'Yes\n"**Decisions for you:**\n1. Keep the old file or remove it.\n2. Run the full suite now or later."\n\nNote: the message asks the user to choose.';
  // The result is the whole quoted block, without the note.
  expect(parseYesPhrase(haikuText, DECISIONS_REPLY)).toBe('**Decisions for you:**\n1. Keep the old file or remove it.\n2. Run the full suite now or later.');
});

test('test_yes_then_a_quoted_heading_and_notes_gives_the_heading', () => {
  // Haiku quotes a heading, then explains it and quotes a second sentence.
  const haikuText = 'Yes\n\n"**Decisions for you:**" is a heading, and the list items that follow are choices: "Keep the old file or remove it."';
  // The result is the first quote only.
  expect(parseYesPhrase(haikuText, DECISIONS_REPLY)).toBe('**Decisions for you:**');
});

test('test_yes_with_a_period_then_an_unquoted_heading_gives_the_heading', () => {
  // Haiku writes "Yes." then the heading with no quote marks.
  const haikuText = 'Yes. Choices for you:';
  const replyText = 'I moved the helper into its own file and the test passes.\n\nChoices for you:\n1. Keep the old file or remove it.\n2. Run the full suite now or later.';
  // The result is the heading text.
  expect(parseYesPhrase(haikuText, replyText)).toBe('Choices for you:');
});
