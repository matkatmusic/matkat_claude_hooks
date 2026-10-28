// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test';

const environment = (globalThis as any).process.env;
environment.TYPESAFE_API_KEY ??= 'test-only';

async function validateQuestionPaths() {
  const { buildNodeRequest } = await import('./typesafe-checker');
  const state = { reply: { text: 'I fixed the bug.' }, userPrompt: 'fix the bug', taskList: [{ id: '1', subject: 'fix the bug', status: 'pending' }] };
  const choiceLabels = { yes: 'yes, the user asked for it', no: 'no, the user did not ask for it' };
  const statePaths = { userPrompt: '`userPrompt`', taskList: '`taskList`' };
  const request: any = buildNodeRequest(state, 'Did the user ask for this?', choiceLabels, statePaths);
  const questionNames = Object.keys(request.questions);
  expect(questionNames).toEqual(Object.keys(choiceLabels));

  for (const questionName of questionNames) {
    const instructions = request.questions[questionName].instructions;
    for (const instructionValue of Object.values(instructions) as string[]) {
      const pieces = instructionValue.split('`');
      for (let pieceIndex = 1; pieceIndex < pieces.length; pieceIndex += 2) {
        const backtickedText = pieces[pieceIndex] as string;
        const steps = backtickedText.split('.');
        let found: any = request.state;
        for (const step of steps)
          found = found[step];
        expect(found).toBeDefined();
        const isString = typeof found === 'string';
        if (isString)
          expect(found.length > 0).toBe(true);
      }
    }
  }
}

test('test_every_question_path_points_to_a_value_in_the_state', validateQuestionPaths);

// async function validateQuestionPaths() {
//   const { buildReplyRequest } = await import('./typesafe-checker')
//   const request: any = buildReplyRequest('I fixed the bug.')
//   const questionNames = Object.keys(request.questions)
//   expect(questionNames.length).toBe(Object.keys(request.state.categories).length)
//
//   for (const questionName of questionNames) {
//     const instructions = request.questions[questionName].instructions
//     for (const instructionValue of Object.values(instructions) as string[]) {
//       const pieces = instructionValue.split('`')
//       for (let pieceIndex = 1; pieceIndex < pieces.length; pieceIndex += 2) {
//         const backtickedText = pieces[pieceIndex] as string
//         const isStatePath = backtickedText.includes('.')
//         if (!isStatePath)
//           continue
//         const steps = backtickedText.split('.')
//         let found: any = request.state
//         for (const step of steps)
//           found = found[step]
//         const isString = typeof found === 'string'
//         const hasLength = isString ? found.length > 0 : false
//         const hasText = isString && hasLength
//         expect(hasText).toBe(true)
//       }
//     }
//   }
// }
//
// test('test_every_question_path_points_to_a_non_empty_string_in_the_state', validateQuestionPaths)
