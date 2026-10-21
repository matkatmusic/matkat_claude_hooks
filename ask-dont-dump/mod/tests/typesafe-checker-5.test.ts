// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test'

const environment = (globalThis as any).process.env
environment.TYPESAFE_API_KEY ??= 'test-only'

async function validateNodeRequest() {
  const { buildNodeRequest } = await import('./typesafe-checker-5')
  const nodeLabel = 'Is the work already assigned to a helper?'
  const taskList = [{ id: '1', subject: 'fix the bug', status: 'pending' }]
  const replyState = { reply: { text: 'I fixed the bug.' }, userPrompt: 'fix the bug', taskList }
  const item = { id: 'item_1', sourceText: 'I fixed the bug.' }
  const request: any = buildNodeRequest(replyState, nodeLabel, 'item', item, { taskList })

  const instructions = request.questions.answer.instructions
  expect(instructions.question.includes(nodeLabel)).toBe(true)

  const statePathNames: string[] = []
  for (const name of Object.keys(instructions)) {
    const isStatePath = name !== 'question'
    if (isStatePath)
      statePathNames.push(name)
  }
  expect(statePathNames).toEqual(['reply', 'userPrompt', 'item', 'taskList'])
  for (const statePathName of statePathNames) {
    const steps = instructions[statePathName].split('`')[1].split('.')
    let found: any = request.state
    for (const step of steps)
      found = found[step]
    expect(found).toBeDefined()
  }
}

test('test_node_request_puts_the_label_in_the_question_and_every_state_path_exists', validateNodeRequest)
