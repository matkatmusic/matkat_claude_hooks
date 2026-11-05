import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import css from '@eslint/css';
import html from '@html-eslint/eslint-plugin';

const FUNCTION_VERBS = [
  'get', 'read', 'load', 'fetch', 'collect', 'extract', 'open',
  'set', 'write', 'store', 'save', 'fill', 'create', 'update', 'format', 'list', 'emit', 'install', 'copy',
  'generate', 'compute', 'calculate', 'count', 'measure', 'add', 'parse',
  'init', 'apply', 'reset', 'dispatch', 'trigger', 'execute', 'stop', 'launch', 'wait', 'retry', 'enable', 'toggle',
  'select', 'filter', 'wrap', 'sort', 'hide', 'disable', 'block', 'deny',
  'remove', 'clear', 'trim', 'pop', 'append', 'insert', 'push', 'modify', 'replace', 'convert', 'transform', 'normalize', 'encode', 'decode', 'merge', 'join', 'split', 'move',
  'validate', 'contains',
  'match', 'compare', 'is', 'exists', 'equals',
  'find', 'search', 'scan',
  'build', 'schedule', 'close',
  'receive', 'attach', 'rename', 'sync', 'report', 'send', 'notify', 'mark',
  'refresh', 'render', 'print', 'log', 'spawn', 'register', 'assert',
];

const VERB_WORD = `^([a-z0-9]+_)?(${FUNCTION_VERBS.join('|')})([A-Z0-9_]|$)|^(toJSON|toString|writeln|scrollToBottom|onSelectionChange|resize|fit|proposeDimensions|observe|unobserve|disconnect)$`;
const FUNCTION_NAME_SELECTOR = [
  `FunctionDeclaration > Identifier.id[name!=/${VERB_WORD}/]`,
  `VariableDeclarator[init.type=/^(ArrowFunctionExpression|FunctionExpression)$/] > Identifier.id[name!=/${VERB_WORD}/]`,
  `MethodDefinition[kind="method"] > Identifier.key[name!=/${VERB_WORD}/]`,
].join(', ');

export default [
  {
    basePath: '/',
    ignores: [
      '**/*.test.ts',
      '**/node_modules/**',
      '**/claude/hooks/fixtures/**',
      '**/dist/**',
      '**/build/**',
    ],
  },
  {
    basePath: '/',
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/brace-style': ['error', 'stroustrup', { allowSingleLine: false }],
      '@stylistic/nonblock-statement-body-position': ['error', 'below'],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      '@stylistic/indent': ['error', 2],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/semi': ['error', 'always'],
      'max-lines-per-function': ['error', { max: 15, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name=/^(map|filter|reduce|forEach|flatMap|some|every|find|findIndex)$/]',
          message: 'Use a for loop that pushes into a named result array.',
        },
        {
          selector: 'IfStatement > .test[type="CallExpression"][callee.type="MemberExpression"][callee.property.name=/^(test|match)$/], IfStatement > .test CallExpression[callee.type="MemberExpression"][callee.property.name=/^(test|match)$/], WhileStatement > .test[type="CallExpression"][callee.type="MemberExpression"][callee.property.name=/^(test|match)$/], WhileStatement > .test CallExpression[callee.type="MemberExpression"][callee.property.name=/^(test|match)$/], ConditionalExpression > .test[type="CallExpression"][callee.type="MemberExpression"][callee.property.name=/^(test|match)$/], ConditionalExpression > .test CallExpression[callee.type="MemberExpression"][callee.property.name=/^(test|match)$/], LogicalExpression CallExpression[callee.type="MemberExpression"][callee.property.name=/^(test|match)$/]',
          message: 'Name the regex as a const and the result as a boolean before the condition.',
        },
        {
          selector: 'CallExpression > .arguments[type=/^(ArrowFunctionExpression|FunctionExpression)$/] LogicalExpression[operator=/^(&&|\\|\\|)$/], IfStatement > .test[type="LogicalExpression"][operator=/^(&&|\\|\\|)$/], IfStatement > .test LogicalExpression[operator=/^(&&|\\|\\|)$/], WhileStatement > .test[type="LogicalExpression"][operator=/^(&&|\\|\\|)$/], WhileStatement > .test LogicalExpression[operator=/^(&&|\\|\\|)$/]',
          message: 'One named boolean per side; combine them on their own line.',
        },
        {
          selector: 'IfStatement > .test[type="CallExpression"], IfStatement > .test CallExpression',
          message: 'Assign the call result to a named const before the if.',
        },
        {
          selector: 'CallExpression[callee.type="MemberExpression"][callee.object.type="CallExpression"][callee.object.callee.type="MemberExpression"][callee.object.callee.object.type="CallExpression"]',
          message: 'Break the chain: one call per line into a named variable.',
        },
        {
          selector: FUNCTION_NAME_SELECTOR,
          message: 'Function names need a verb from FUNCTION_VERBS in the eslint.config.js of the debt-ratchet folder.',
        },
        {
          selector: 'CallExpression > .arguments[type=/^(ArrowFunctionExpression|FunctionExpression)$/]',
          message: 'Pass a named function, not an inline one.',
        },
      ],
    },
  },
  {
    basePath: '/',
    files: ['**/*.css'],
    plugins: { css },
    language: 'css/css',
    rules: {
      'css/no-invalid-properties': 'error',
      'css/no-invalid-at-rules': 'error',
      'css/no-invalid-at-rule-placement': 'error',
      'css/no-invalid-named-grid-areas': 'error',
      'css/no-empty-blocks': 'error',
      'css/no-duplicate-imports': 'error',
      'css/no-duplicate-keyframe-selectors': 'error',
      'css/no-unmatchable-selectors': 'error',
      'css/selector-complexity': ['error', { maxIds: 1, maxClasses: 3, maxTypes: 3, maxAttributes: 2, maxPseudoClasses: 2, maxUniversals: 1, maxCompounds: 4, maxCombinators: 3 }],
      'css/no-important': 'error',
      'css/relative-font-units': 'error',
      'css/prefer-logical-properties': 'error',
      'css/font-family-fallbacks': 'error',
      'css/use-baseline': 'error',
    },
  },
  {
    basePath: '/',
    files: ['**/*.html'],
    plugins: { '@html-eslint': html },
    language: '@html-eslint/html',
    rules: {
      '@html-eslint/no-duplicate-id': 'error',
      '@html-eslint/no-duplicate-attrs': 'error',
      '@html-eslint/require-closing-tags': 'error',
      '@html-eslint/require-doctype': 'error',
      '@html-eslint/require-title': 'error',
      '@html-eslint/require-lang': 'error',
      '@html-eslint/require-meta-charset': 'error',
      '@html-eslint/max-element-depth': ['error', { max: 8 }],
      '@html-eslint/no-inline-styles': 'error',
      '@html-eslint/require-img-alt': 'error',
      '@html-eslint/require-input-label': 'error',
      '@html-eslint/no-skip-heading-levels': 'error',
      '@html-eslint/no-nested-interactive': 'error',
      '@html-eslint/no-restricted-tags': ['error', { tagPatterns: ['^style$'], message: 'Move the style block to a separate .css file.' }],
      '@html-eslint/require-attrs': ['error', { tag: 'script', attr: 'src', message: 'Move the script block to a separate .js file.' }],
    },
  },
];
