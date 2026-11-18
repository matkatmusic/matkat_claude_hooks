import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import css from '@eslint/css';
import html from '@html-eslint/eslint-plugin';
import checkFile from 'eslint-plugin-check-file';

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

const BASE_CONFIG = [
  {
    basePath: '/',
    ignores: [
      // '**/*.test.ts',
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

const BASE_SELECTORS = BASE_CONFIG[1].rules['no-restricted-syntax'].slice(1);
const TEST_FILES = ['**/*.test.ts', '**/*.spec.ts'];
const REGISTER_FILES = ['**/register.ts'];
const ALLOWED_TOP_LEVEL_NODE_TYPES = [
  'ImportDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration', 'ExportAllDeclaration',
  'TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'TSEnumDeclaration',
  'FunctionDeclaration', 'TSDeclareFunction', 'ClassDeclaration', 'VariableDeclaration',
];
const MAIN_GUARD_SELECTOR = 'IfStatement[test.type="MemberExpression"][test.object.type="MetaProperty"][test.property.name="main"]:not([alternate])';
const TEST_CALL_SELECTOR = 'ExpressionStatement[expression.type="CallExpression"][expression.callee.name=/^(test|describe)$/]';
const AWAIT_IMPORT_SELECTOR = 'ExpressionStatement[expression.type="AwaitExpression"][expression.argument.type="ImportExpression"]';
const HOOK_DECLARATION_EXEMPTION = ':not([declarations.0.id.typeAnnotation.typeAnnotation.typeName.name=/^(Hook|Register)$/])';
const GLOBAL_VARIABLE_MESSAGE = 'No global variables: move the value into a function, or into a static member of a class that has a private constructor and a getInstance() method.';
const TOP_LEVEL_CODE_MESSAGE = 'Write code inside functions. The top level allows only imports, exports, type, interface, enum, function and class declarations, and one `if (import.meta.main) { main(); }` block.';

function buildTopLevelSelectors(extraAllowedSelectors, variableExemption) {
  const allowedSelectors = [...ALLOWED_TOP_LEVEL_NODE_TYPES, MAIN_GUARD_SELECTOR, ...extraAllowedSelectors];
  return [
    {
      selector: `Program > VariableDeclaration${variableExemption}, Program > ExportNamedDeclaration > VariableDeclaration${variableExemption}`,
      message: GLOBAL_VARIABLE_MESSAGE,
    },
    {
      selector: `Program > :not(${allowedSelectors.join(', ')})`,
      message: TOP_LEVEL_CODE_MESSAGE,
    },
    {
      selector: `Program > ${MAIN_GUARD_SELECTOR} > BlockStatement > :not(ExpressionStatement[expression.callee.name="main"])`,
      message: TOP_LEVEL_CODE_MESSAGE,
    },
  ];
}

function buildRestrictedSyntaxConfig(files, ignores, topLevelSelectors) {
  return {
    basePath: '/',
    files,
    ignores,
    rules: { 'no-restricted-syntax': ['error', ...BASE_SELECTORS, ...topLevelSelectors] },
  };
}

const SHEBANG_MAIN_MESSAGE = 'A file with a #! first line needs a main() function.';
const FIRST_LINE_START = { line: 1, column: 0 };
const FIRST_LINE_SHEBANG_END = { line: 1, column: 2 };

const shebangRequiresMainRule = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    return {
      Program(program) {
        const startsWithShebang = context.sourceCode.text.startsWith('#!');
        if (!startsWithShebang)
          return;
        let hasMainFunction = false;
        for (const statement of program.body) {
          const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
          const isMainFunction = declaration?.type === 'FunctionDeclaration' && declaration.id?.name === 'main';
          if (isMainFunction)
            hasMainFunction = true;
        }
        if (!hasMainFunction)
          context.report({ loc: { start: FIRST_LINE_START, end: FIRST_LINE_SHEBANG_END }, message: SHEBANG_MAIN_MESSAGE });
      },
    };
  },
};

export default [
  ...BASE_CONFIG,
  {
    basePath: '/',
    files: ['**/*.ts'],
    plugins: { local: { rules: { 'shebang-requires-main': shebangRequiresMainRule } } },
    rules: { 'local/shebang-requires-main': 'error' },
  },
  {
    basePath: '/',
    files: ['**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'error',
      'no-var': 'error',
      'prefer-destructuring': ['error', { VariableDeclarator: { array: false, object: true }, AssignmentExpression: { array: false, object: true } }],
    },
  },
  {
    basePath: '/',
    files: ['**/*.ts'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': ['error', { '**/*.ts': 'CAMEL_CASE' }, { ignoreMiddleExtensions: true }],
    },
  },
  buildRestrictedSyntaxConfig(['**/*.ts'], [...TEST_FILES, ...REGISTER_FILES], buildTopLevelSelectors([], '')),
  buildRestrictedSyntaxConfig(TEST_FILES, [], buildTopLevelSelectors([TEST_CALL_SELECTOR, AWAIT_IMPORT_SELECTOR], '')),
  buildRestrictedSyntaxConfig(REGISTER_FILES, [], buildTopLevelSelectors([], HOOK_DECLARATION_EXEMPTION)),
];
