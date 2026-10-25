import { snippet } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { StateField } from '@codemirror/state';
import type { EditorState, Extension, Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { createAddQuestionElement } from './addQuestionMenu';
import { findTopLevelObject } from './questionNames';
import { buildInsertPlan } from './questionSnippets';
import type { QuestionType } from './questionSnippets';

export function insertQuestion(view: EditorView, type: QuestionType): void {
  const text = view.state.doc.toString();
  const plan = buildInsertPlan(syntaxTree(view.state), text, type);
  snippet(plan.template)(view, null, plan.from, plan.to);
  view.focus();
}

class AddQuestionWidget extends WidgetType {
  // eslint-disable-next-line no-restricted-syntax
  toDOM(view: EditorView): HTMLElement {
    function insertPicked(type: QuestionType): void {
      insertQuestion(view, type);
    }
    return createAddQuestionElement(insertPicked);
  }
}

const addQuestionDecoration = Decoration.widget({ widget: new AddQuestionWidget(), block: true, side: -1 });

export function findClosingBracePosition(state: EditorState): number | null {
  const rootNode = findTopLevelObject(syntaxTree(state));
  if (rootNode === null)
    return null;
  const closeBrace = rootNode.lastChild;
  if (closeBrace === null)
    return null;
  if (closeBrace.name !== '}')
    return null;
  return closeBrace.from;
}

function buildDecorations(state: EditorState): DecorationSet {
  const position = findClosingBracePosition(state);
  if (position === null)
    return Decoration.none;
  return Decoration.set([addQuestionDecoration.range(position)]);
}

function updateDecorations(value: DecorationSet, transaction: Transaction): DecorationSet {
  if (!transaction.docChanged)
    return value;
  return buildDecorations(transaction.state);
}

function getFieldDecorations(field: StateField<DecorationSet>): Extension {
  return EditorView.decorations.from(field);
}

const addQuestionField = StateField.define<DecorationSet>({
  create: buildDecorations,
  update: updateDecorations,
  provide: getFieldDecorations,
});

export function createAddQuestion(): Extension {
  return addQuestionField;
}
