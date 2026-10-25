import { basicSetup, EditorView } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { createAddQuestion } from './addQuestion';
import { createPlaceholders } from './placeholders';
import { createQuestionCompletion } from './questionCompletion';
import type { EditorPair } from './types';
import { getElement } from './dom';
import { applyNoteBox } from './noteBox';
import { getEditors, pageState } from './state';

export const EDITOR_THEME_RULES = {
  '&': { height: '26vh', background: 'var(--panel)', color: 'var(--tok-punct)', border: '1px solid var(--grid)', borderRadius: '6px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '13px' },
  '.cm-gutters': { background: 'var(--panel)', color: 'var(--text-muted)', border: 'none' },
  '.cm-panels': { background: 'var(--panel)', color: 'var(--text)' },
  '.cm-tooltip': { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--grid)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--mark-question)', color: 'var(--text)' },
};

const jsonHighlight = HighlightStyle.define([
  { tag: tags.string, color: 'var(--tok-string)' },
  { tag: tags.number, color: 'var(--tok-number)' },
  { tag: tags.propertyName, color: 'var(--tok-key)' },
  { tag: [tags.bool, tags.null], color: 'var(--tok-atom)' },
  { tag: [tags.punctuation, tags.brace, tags.squareBracket, tags.separator], color: 'var(--tok-punct)' },
]);

export function createEditors(onDocChange: (update: ViewUpdate) => void): EditorPair {
  const editorExtensions: Extension[] = [
    basicSetup,
    json(),
    EditorView.lineWrapping,
    syntaxHighlighting(jsonHighlight),
    EditorView.updateListener.of(onDocChange),
    EditorView.theme(EDITOR_THEME_RULES),
    linter(jsonParseLinter()),
    lintGutter(),
    keymap.of([indentWithTab]),
  ];
  const questionsExtensions: Extension[] = [editorExtensions, createQuestionCompletion(), createAddQuestion(), createPlaceholders()];
  const stateEditor = new EditorView({ doc: '', extensions: editorExtensions, parent: getElement('stateEditor') });
  // const questionsEditor = new EditorView({ doc: '', extensions: editorExtensions, parent: getElement('questionsEditor') });
  const questionsEditor = new EditorView({ doc: '', extensions: questionsExtensions, parent: getElement('questionsEditor') });
  return { stateEditor: stateEditor, questionsEditor: questionsEditor };
}

export function replaceEditorText(editor: EditorView, text: string): void {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
}

export function loadEditors(): void {
  const version = pageState.versions[pageState.index];
  applyNoteBox(version.outputs.length > 0, version.note);
  const editors = getEditors();
  replaceEditorText(editors.stateEditor, JSON.stringify(version.state, null, 2));
  replaceEditorText(editors.questionsEditor, JSON.stringify(version.questions, null, 2));
}
