// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test'

const environment = (globalThis as any).process.env
environment.TYPESAFE_API_KEY ??= 'test-only'

async function validateQuestionPaths() {
  const { buildReplyRequest } = await import('./typesafe-checker')
  const request: any = buildReplyRequest('I fixed the bug.')
  const questionNames = Object.keys(request.questions)
  expect(questionNames.length).toBe(Object.keys(request.state.categories).length)

  for (const questionName of questionNames) {
    const instructions = request.questions[questionName].instructions
    for (const instructionValue of Object.values(instructions) as string[]) {
      const pieces = instructionValue.split('`')
      for (let pieceIndex = 1; pieceIndex < pieces.length; pieceIndex += 2) {
        const backtickedText = pieces[pieceIndex] as string
        const isStatePath = backtickedText.includes('.')
        if (!isStatePath)
          continue
        const steps = backtickedText.split('.')
        let found: any = request.state
        for (const step of steps)
          found = found[step]
        const isString = typeof found === 'string'
        const hasLength = isString ? found.length > 0 : false
        const hasText = isString && hasLength
        expect(hasText).toBe(true)
      }
    }
  }
}

test('test_every_question_path_points_to_a_non_empty_string_in_the_state', validateQuestionPaths)
