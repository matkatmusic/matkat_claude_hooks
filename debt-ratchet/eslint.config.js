import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

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
];
