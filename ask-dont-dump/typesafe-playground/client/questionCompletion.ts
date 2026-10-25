import { autocompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { collectPropertyNames } from './questionNames';
import { getEditors } from './state';

const NAME_TYPING = /^[^`\s]*$/;

export function mergeNames(first: string[], second: string[]): string[] {
  const merged: string[] = [];
  for (let i = 0; i < first.length; i++)
    merged.push(first[i]);
  for (let i = 0; i < second.length; i++) {
    const isNew = !merged.includes(second[i]);
    if (isNew)
      merged.push(second[i]);
  }
  return merged;
}

export function buildNameOptions(names: string[]): Completion[] {
  const options: Completion[] = [];
  for (let i = 0; i < names.length; i++)
    options.push({ label: names[i], apply: names[i] + '`' });
  return options;
}

export function listEditorNames(state: EditorState): string[] {
  return collectPropertyNames(syntaxTree(state), state.doc.toString());
}

export function findBacktickNames(context: CompletionContext): CompletionResult | null {
  const lastTyped = context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos);
  if (lastTyped !== '`')
    return null;
  const editors = getEditors();
  const stateNames = listEditorNames(editors.stateEditor.state);
  const questionNames = listEditorNames(editors.questionsEditor.state);
  const names = mergeNames(stateNames, questionNames);
  return { from: context.pos, options: buildNameOptions(names), validFor: NAME_TYPING };
}

export function createQuestionCompletion(): Extension {
  return autocompletion({ override: [findBacktickNames] });
}
