import type { Tree } from '@lezer/common';
import { findTopLevelObject, listTopLevelKeys, listTopLevelProperties } from './questionNames';

export type QuestionType = 'noul' | 'score' | 'choice';

export interface InsertPlan {
  from: number;
  to: number;
  template: string;
}

function buildNoulLines(name: string): string[] {
  return [
    '"${1:' + name + '}": {',
    '  "type": "noul",',
    '  "instructions": "${2:instruction}",',
    '  "criteria": {',
    '    "true": "${3:description}",',
    '    "false": "${4:description}"',
    '  }',
    '}',
  ];
}

function buildScoreLines(name: string): string[] {
  return [
    '"${1:' + name + '}": {',
    '  "type": "score",',
    '  "instructions": "${2:instruction}",',
    '  "criteria": [',
    '    "${3:score 0 description}",',
    '    "${4:score 1 description}",',
    '    "${5:score 2 description}"',
    '  ]',
    '}',
  ];
}

function buildChoiceLines(name: string): string[] {
  return [
    '"${1:' + name + '}": {',
    '  "type": "choice",',
    '  "instructions": "${2:Which option best fits the state?}",',
    '  "criteria": {',
    '    "${3:option_a}": "${4:Description of an option}",',
    '    "${5:option_b}": "${6:Another description of a distinct option}",',
    '    "${7:option_c}": "${8:Another mutually exclusive option}"',
    '  }',
    '}',
  ];
}

export function findNextFreeName(type: QuestionType, usedNames: string[]): string {
  let number = 1;
  while (usedNames.includes('new_' + type + '_' + number))
    number++;
  return 'new_' + type + '_' + number;
}

export function buildQuestionLines(type: QuestionType, name: string): string[] {
  if (type === 'noul')
    return buildNoulLines(name);
  if (type === 'score')
    return buildScoreLines(name);
  return buildChoiceLines(name);
}

export function buildInsertPlan(tree: Tree, text: string, type: QuestionType): InsertPlan {
  const rootNode = findTopLevelObject(tree);
  if (rootNode === null)
    throw new Error('questions text has no top-level object');
  const name = findNextFreeName(type, listTopLevelKeys(rootNode, text));
  const lines = buildQuestionLines(type, name);
  const properties = listTopLevelProperties(rootNode);
  if (properties.length > 0) {
    const lastEnd = properties[properties.length - 1].to;
    return { from: lastEnd, to: lastEnd, template: ',\n' + lines.join('\n') };
  }
  const openBrace = rootNode.firstChild;
  const closeBrace = rootNode.lastChild;
  if (openBrace === null)
    throw new Error('top-level object has no opening brace');
  if (closeBrace === null)
    throw new Error('top-level object has no closing brace');
  if (closeBrace.name !== '}')
    throw new Error('top-level object has no closing brace');
  const indented: string[] = [];
  for (let i = 0; i < lines.length; i++)
    indented.push('  ' + lines[i]);
  return { from: openBrace.to, to: closeBrace.from, template: '\n' + indented.join('\n') + '\n' };
}
